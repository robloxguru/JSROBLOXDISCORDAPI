import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as DB from "../../../api/modules/db.js";

export const data = new SlashCommandBuilder()
    .setName('execute')
    .setDescription('Enqueue a command using your API key.')
    .addStringOption(option =>
        option.setName('apikey')
              .setDescription('Your API key')
              .setRequired(true)
    )
    .addStringOption(option =>
        option.setName('payload')
              .setDescription('The command payload to enqueue')
              .setRequired(true)
    );

export async function execute(interaction) {
    const apiKey = interaction.options.getString('apikey');
    const payload = interaction.options.getString('payload');

    DB.getRowAsJson("apiKeys", { apiKey }, (err, keyRow) => {
        if (err) {
            console.error(err);
            return interaction.reply('Database error occurred.');
        }
        if (!keyRow) {
            return interaction.reply('Invalid API key.');
        }

        DB.addRow("commandExecutionQueue", {
            apiKey,
            timestamp: Date.now(),
            data: payload
        });

        const embed = new EmbedBuilder()
            .setColor(0xffffff)
            .setTitle('Command Enqueued')
            .addFields(
                { name: 'Payload', value: payload, inline: false },
                { name: 'Timestamp', value: new Date().toISOString(), inline: true }
            );

        interaction.reply({ embeds: [embed] });
    });
}