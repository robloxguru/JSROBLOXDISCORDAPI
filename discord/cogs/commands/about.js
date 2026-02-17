import { SlashCommandBuilder } from 'discord.js';
import { EmbedBuilder, Embed  } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('about')
    .setDescription('Get information about this API system.');

export async function execute(interaction) {
    let embed = new EmbedBuilder()
        .setColor(0xffffff)
        .setDescription("This bot is hosted using downloaded assets from [this source](https://robloxguru.github.io/sources/api). This has been developed for server moderators or game developers that want to connect their Roblox systems to Discord to remotely access / manage members.")
    await interaction.reply({embeds: [embed]});
}