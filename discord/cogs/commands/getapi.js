import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import * as DB from "../../../api/modules/db.js";

export const data = new SlashCommandBuilder()
    .setName('apikey')
    .setDescription('Retrieve the API key for a specific Job ID.')
    .addStringOption(option => 
        option.setName('jobid')
              .setDescription('The Job ID to look up')
              .setRequired(true)
    );

export async function execute(interaction) {
    const jobId = interaction.options.getString('jobid');

    // Look up the API key in the apiKeys table
    DB.getRowAsJson("apiKeys", { jobId }, (err, row) => {
        if (err) {
            console.error(err);
            return interaction.reply({ content: 'Database error occurred.', flags: [MessageFlags.Ephemeral] });
        }

        if (!row) {
            return interaction.reply({ content: `No API key found for Job ID \`${jobId}\`.`, flags: [MessageFlags.Ephemeral] });
        }

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(`API Key for Job ID: ${jobId}`)
            .setDescription(`\`${row.apiKey}\``)
            .setFooter({ text: 'Only you can see this.' });

        interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    });
}
