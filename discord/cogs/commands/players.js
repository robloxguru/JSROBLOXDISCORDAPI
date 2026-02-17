import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import * as DB from "../../../api/modules/db.js";

export const data = new SlashCommandBuilder()
    .setName('players')
    .setDescription('Show first 13 players with a specific Job ID.')
    .addStringOption(option => 
        option.setName('jobid')
              .setDescription('Job ID to filter players')
              .setRequired(true)
    );

export async function execute(interaction) {
    const jobIdTarget = interaction.options.getString('jobid');

    DB.getRowsFilteredAsJson('players', '', [], (err, playerRows) => {
        if (err) {
            console.error(err);
            return interaction.reply({ content: 'Database error occurred.', flags: [MessageFlags.Ephemeral] });
        }

        let filteredPlayers = [];

        for (const row of playerRows) {
            if (!row.data) continue;

            try {
                const players = JSON.parse(row.data);
                for (const info of Object.values(players)) {
                    if (info.jobId?.toString() === jobIdTarget) {
                        filteredPlayers.push(info);
                    }
                }
            } catch (parseErr) {
                console.error('Failed to parse player JSON:', parseErr);
            }
        }

        if (filteredPlayers.length === 0) {
            return interaction.reply({ content: `No players found with Job ID \`${jobIdTarget}\`.`, flags: [MessageFlags.Ephemeral] });
        }

        // Take first 13 players
        const firstPlayers = filteredPlayers.slice(0, 13);

        // Format as "username : userid : jobid"
        const playerList = firstPlayers
            .map(p => `- ${p.Name || 'N/A'} : ${p.UserId || 'N/A'} : ${p.jobId || 'N/A'}`)
            .join('\n');

        const truncatedList = playerList.length > 1024 ? playerList.slice(0, 1021) + '...' : playerList;

        const embed = new EmbedBuilder()
            .setColor(0xffffff)
            .setTitle(`Players with Job ID ${jobIdTarget}`)
            .setDescription(truncatedList);

        interaction.reply({ embeds: [embed] });
    });
}
