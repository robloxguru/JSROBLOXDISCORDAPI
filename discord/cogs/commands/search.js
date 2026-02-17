import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import * as DB from "../../../api/modules/db.js";

export const data = new SlashCommandBuilder()
    .setName('search')
    .setDescription('Find a player by UserID or Username.')
    .addStringOption(option => 
        option.setName('target')
              .setDescription('UserID or Username to search for')
              .setRequired(true)
    );

export async function execute(interaction) {
    const target = interaction.options.getString('target');

    // Determine if target is numeric (UserID) or not (Username)
    const searchField = /^\d+$/.test(target) ? 'UserId' : 'Name';

    DB.getRowsFilteredAsJson('players', '', [], (err, playerRows) => {
        if (err) {
            console.error(err);
            return interaction.reply({ content: 'Database error occurred.', flags:[MessageFlags.Ephemeral] });
        }

        let foundPlayer = null;

        for (const row of playerRows) {
            if (!row.data) continue;

            try {
                const players = JSON.parse(row.data);
                for (const [userId, info] of Object.entries(players)) {
                    if (searchField === 'UserId' && info.UserId.toString() === target) {
                        foundPlayer = info;
                        break;
                    } else if (searchField === 'Name' && info.Name === target) {
                        foundPlayer = info;
                        break;
                    }
                }
                if (foundPlayer) break;
            } catch (parseErr) {
                console.error('Failed to parse player JSON:', parseErr);
            }
        }

        if (!foundPlayer) {
            return interaction.reply({ content: `No player found with ${searchField} \`${target}\`.`, flags:[MessageFlags.Ephemeral] });
        }

        const embed = new EmbedBuilder()
            .setColor(0xffffff)
            .setTitle(`Player Info`)
            .addFields(
                { name: 'Job ID', value: foundPlayer.jobId || 'N/A', inline: true },
                { name: 'UserID', value: foundPlayer.UserId?.toString() || 'N/A', inline: true },
                { name: 'Username', value: foundPlayer.Name || 'N/A', inline: true },
                { name: 'Display Name', value: foundPlayer.DisplayName || 'N/A', inline: true },
                { name: 'Verified', value: foundPlayer.Verified ? 'Yes' : 'No', inline: true }
            );

        interaction.reply({ embeds: [embed] });
    });
}
