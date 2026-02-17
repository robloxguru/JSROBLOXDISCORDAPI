import express from "express";
import crypto from "crypto";
import * as DB from "./modules/db.js";

import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Client, Collection, GatewayIntentBits, MessageFlags, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { pathToFileURL } from 'url';


dotenv.config({ path: path.resolve('config/dc/config.env') });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

const commandsPath = path.join(process.cwd(), 'discord', 'cogs', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const { data, execute } = await import(pathToFileURL(filePath).href);
    client.commands.set(data.name, { data, execute });
}

const listenersPath = path.join(process.cwd(), 'discord', 'cogs', 'listeners');
const listenerFiles = fs.readdirSync(listenersPath).filter(f => f.endsWith('.js'));

for (const file of listenerFiles) {
    const filePath = path.join(listenersPath, file);
    const { event, once, listener } = await import(filePath);
    if (once) client.once(event, (...args) => listener(...args, client));
    else client.on(event, (...args) => listener(...args, client));
}

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    const commandsData = client.commands.map(cmd => cmd.data.toJSON());

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commandsData }
        );
        console.log(`Registered ${commandsData.length} commands to guild ${process.env.GUILD_ID}`);
    } catch (err) {
        console.error(err);
    }
});


client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const commandName = interaction.commandName;
    const command = client.commands.get(commandName);
    if (!command) return;

    const groupsFile = path.join(process.cwd(), 'discord', 'groups.json');
    let groupsData;
    try {
        groupsData = JSON.parse(fs.readFileSync(groupsFile, 'utf-8'));
    } catch (err) {
        console.error('Failed to read groups.json:', err);
        return interaction.reply({ content: 'Server configuration error.', flags:[MessageFlags.Ephemeral] });
    }

    const cmdConfig = groupsData.commands?.[commandName];
    if (!cmdConfig) {
        return interaction.reply({ content: 'This command is not configured.', flags:[MessageFlags.Ephemeral] });
    }

    if (!cmdConfig.enabled) {
        return interaction.reply({ content: 'This command is currently disabled.', flags:[MessageFlags.Ephemeral] });
    }

    const groupName = cmdConfig.group;
    const group = groupsData.groups?.[groupName];
    if (!group) {
        return interaction.reply({ content: `Invalid group "${groupName}" for this command.`, flags:[MessageFlags.Ephemeral] });
    }

    const userId = interaction.user.id;
    const member = interaction.member;

    const isUserBlacklisted = group.blacklistedUserIDs?.includes(userId) ||
        member.roles.cache.some(role => group.blacklistedRoleIDs?.includes(role.id));

    if (isUserBlacklisted) {
        return interaction.reply({ content: 'You are not allowed to use this command.', flags:[MessageFlags.Ephemeral] });
    }
    if (!cmdConfig.everyoneCanUse) {
        const isUserInGroup = group.userIDs?.includes(userId) ||
            member.roles.cache.some(role => group.roleIDs?.includes(role.id));

        if (!isUserInGroup) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags:[MessageFlags.Ephemeral] });
        }
    }
    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(err);
        await interaction.reply({ content: 'There was an error executing this command.', flags:[MessageFlags.Ephemeral] });
    }
});


client.login(process.env.BOT_TOKEN);


DB.init();

const app = express();
app.use(express.json());

const PRESET_RAUTH_HASH = "SHA256_HASHED_KEY_HERE";
const RATE_LIMIT_WINDOW = 10 * 1000;
const MAX_REQUESTS = 5;
const STALE_MS = 10 * 1000;

const rateStore = new Map();

function rateLimiter(req, res, next) {
    const ip = req.ip;
    const now = Date.now();

    if (!rateStore.has(ip)) {
        rateStore.set(ip, { count: 1, start: now });
        return next();
    }

    const data = rateStore.get(ip);

    if (now - data.start > RATE_LIMIT_WINDOW) {
        data.count = 1;
        data.start = now;
        return next();
    }

    data.count++;

    if (data.count > MAX_REQUESTS) {
        return res.status(429).json({ error: "Rate limit exceeded" });
    }

    next();
}

function authCheck(type, input, callback) {
    if (type === "rauth") {
        const hash = crypto.createHash("sha1").update(input).digest("hex");
        return callback(null, hash === PRESET_RAUTH_HASH);
    }

    if (type === "pauth") {
        DB.getRowAsJson("apiKeys", { apiKey: input }, (err, row) => {
            if (err) return callback(err);
            callback(null, !!row);
        });
        return;
    }

    callback(null, false);
}

function deleteApiKeyAndCommands(jobId, callback) {
    DB.getRowAsJson("apiKeys", { jobId }, (err, row) => {
        if (err || !row) return callback && callback();

        const apiKey = row.apiKey;

        DB.getRowsFiltered("commandExecutionQueue", "apiKey=?", [apiKey], (err, cmds) => {
            if (cmds && cmds.length > 0) {
                cmds.forEach(cmd => DB.removeRow("commandExecutionQueue", { id: cmd.id }));
            }

            DB.removeRow("apiKeys", { jobId });
            callback && callback();
        });
    });
}

DB.checkIfTableExists("apiKeys", (err, exists) => {
    if (err) return console.error(err);
    if (!exists) {
        DB.addTable("apiKeys", [
            "jobId TEXT PRIMARY KEY",
            "apiKey TEXT UNIQUE",
            "lastPing INTEGER"
        ]);
    }

    DB.checkIfTableExists("commandExecutionQueue", (err2, exists2) => {
        if (err2) return console.error(err2);
        if (!exists2) {
            DB.addTable("commandExecutionQueue", [
                "id INTEGER PRIMARY KEY AUTOINCREMENT",
                "apiKey TEXT",
                "timestamp INTEGER",
                "data TEXT"
            ]);
        }

        DB.checkIfTableExists("players", (err3, exists3) => {
            if (err3) return console.error(err3);
            if (!exists3) {
                DB.addTable("players", [
                    "jobId TEXT PRIMARY KEY",
                    "data TEXT",
                    "lastUpdated INTEGER"
                ]);
            }

            console.log("All tables ready.");
            app.listen(3000, () => console.log("API running on http://localhost:3000"));
        });
    });
});

app.get("/test", rateLimiter, (req, res) => {
    res.json({ status: "API online" });
});

app.post("/command/execute", rateLimiter, (req, res) => {
    const apiKey = req.headers["authorization"];
    const data = req.body.data;

    if (!apiKey || !data) return res.status(400).json({ error: "Missing apiKey or data" });

    DB.getRowAsJson("apiKeys", { apiKey }, (err, keyRow) => {
        if (err) return res.status(500).json({ error: "Internal error" });
        if (!keyRow) return res.status(401).json({ error: "Invalid apiKey" });

        DB.addRow("commandExecutionQueue", { apiKey, timestamp: Date.now(), data });
        res.json({ status: "Command enqueued" });
    });
});

app.post("/server/players", rateLimiter, (req, res) => {
    const apiKey = req.headers["authorization"];

    if (!apiKey) return res.status(400).json({ error: "Missing apiKey" });

    DB.getRowAsJson("apiKeys", { apiKey }, (err, keyRow) => {
        if (err) return res.status(500).json({ error: "Internal error" });
        if (!keyRow) return res.status(401).json({ error: "Invalid apiKey" });

        const jobId = keyRow.jobId;

        DB.getRowAsJson("players", { jobId }, (err, row) => {
            if (err) return res.status(500).json({ error: "Internal error" });
            let players = {};
            if (row && row.data) {
                try { players = JSON.parse(row.data); } catch {}
            }
            res.json({ jobId, players });
        });
    });
});
app.post("/internal/server/submitPlayers", rateLimiter, (req, res) => {
    const authHeader = req.headers["authorization"];
    const apiKey = req.headers["apikey"];
    const jobId = req.headers["jobid"];
    const players = req.body.players;

    if (!authHeader || !apiKey || !jobId || !players)
        return res.status(400).json({ error: "Missing required headers or players data" });

    authCheck("rauth", authHeader, (err, valid) => {
        if (err) return res.status(500).json({ error: "Internal error" });
        if (!valid) return res.status(401).json({ error: "Invalid authorization header" });

        DB.getRowAsJson("apiKeys", { jobId, apiKey }, (err, keyRow) => {
            if (err) return res.status(500).json({ error: "Internal error" });
            if (!keyRow) return res.status(401).json({ error: "Invalid apiKey/jobId combination" });

            const playerJSON = JSON.stringify(players);
            DB.getRowAsJson("players", { jobId }, (err, existing) => {
                if (existing) {
                    DB.updateRow("players", { data: playerJSON, lastUpdated: Date.now() }, { jobId });
                } else {
                    DB.addRow("players", { jobId, data: playerJSON, lastUpdated: Date.now() });
                }
                res.json({ status: "Players data updated" });
            });
        });
    });
});

app.post("/internal/server/keepAlive", rateLimiter, (req, res) => {
    const authHeader = req.headers["authorization"];
    const apiKey = req.headers["apikey"];
    const jobId = req.headers["jobid"];

    if (!authHeader || !apiKey || !jobId) return res.status(400).json({ error: "Missing required headers" });

    authCheck("rauth", authHeader, (err, valid) => {
        if (err) return res.status(500).json({ error: "Internal error" });
        if (!valid) return res.status(401).json({ error: "Invalid authorization header" });

        DB.getRowsFiltered("apiKeys", "jobId=? OR apiKey=?", [jobId, apiKey], (err, rows) => {
            if (rows && rows.length > 0) {
                rows.forEach(row => {
                    if (row.jobId !== jobId || row.apiKey !== apiKey) {
                        DB.removeRow("apiKeys", { jobId: row.jobId });
                    }
                });
            }

            DB.getRowAsJson("apiKeys", { jobId }, (err, row) => {
                if (row) {
                    DB.updateRow("apiKeys", { lastPing: Date.now(), apiKey }, { jobId });
                } else {
                    DB.addRow("apiKeys", { jobId, apiKey, lastPing: Date.now() });
                }
                res.json({ status: "KeepAlive updated" });
            });
        });
    });
});

app.post("/internal/server/get/data/commands", (req, res) => {
    const apiKey = req.headers["authentication"];
    if (!apiKey) return res.status(400).json({ error: "Missing apiKey" });

    DB.getRowAsJson("apiKeys", { apiKey }, (err, keyRow) => {
        if (err) return res.status(500).json({ error: "Internal error" });
        if (!keyRow) return res.status(401).json({ error: "Invalid API key" });

        DB.getRowsFiltered("commandExecutionQueue", "apiKey=?", [apiKey], (err, commands) => {
            if (err) return res.status(500).json({ error: "Error fetching commands" });

            if (commands && commands.length > 0) {
                commands.forEach(cmd => DB.removeRow("commandExecutionQueue", { id: cmd.id }));
            }

            res.json({ jobId: keyRow.jobId, commands });
        });
    });
});


setInterval(() => {
    const now = Date.now();
    DB.getRowsFiltered("apiKeys", "lastPing IS NOT NULL", [], (err, rows) => {
        if (rows && rows.length > 0) {
            rows.forEach(row => {
                if (now - row.lastPing > STALE_MS) {
                    deleteApiKeyAndCommands(row.jobId, () => {
                        DB.removeRow("players", { jobId: row.jobId });
                    });
                }
            });
        }
    });

}, 5000);
