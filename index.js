require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');

// --- خادم الويب لبقاء البوت نشطاً ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('البوت يعمل بكفاءة!'));
app.listen(port);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates] });
const OWNER_ID = "1344009623887151155";
const VOICE_CHANNEL_ID = "1508154598681088146";
const MUSIC_URL = "https://youtu.be/ZnIHEi3wZJw";

let rolesData = {}; 

const commands = [
    new SlashCommandBuilder().setName('اضافه').setDescription('إضافة رتبة').addStringOption(o => o.setName('ملصق').setDescription('ايموجي').setRequired(true)).addRoleOption(o => o.setName('رتبه').setDescription('الرتبة').setRequired(true)),
    new SlashCommandBuilder().setName('حذف').setDescription('حذف رتبة').addRoleOption(o => o.setName('رتبه').setDescription('الرتبة').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`تم تسجيل البوت: ${client.user.tag}`);

    // --- كود التشغيل الصوتي ---
    const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
    if (channel) {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        async function playMusic() {
            try {
                const stream = await play.stream(MUSIC_URL);
                const resource = createAudioResource(stream.stream, { inputType: stream.type });
                const player = createAudioPlayer();
                connection.subscribe(player);
                player.play(resource);
                player.on(AudioPlayerStatus.Idle, () => playMusic());
            } catch (e) {
                console.error("خطأ في تشغيل الصوت:", e);
                setTimeout(playMusic, 5000);
            }
        }
        playMusic();
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!اعداد' && message.author.id === OWNER_ID) {
        const fetched = await message.channel.messages.fetch({ limit: 50 });
        await message.channel.bulkDelete(fetched.filter(m => m.author.id === client.user.id));
        const embed = new EmbedBuilder().setTitle('🌟 الرتب المتاحة').setDescription('اختر الرتبة التي تناسبك بالضغط على الزر أدناه:').setColor(0x0099FF);
        const rows = [];
        let currentRow = new ActionRowBuilder();
        const keys = Object.keys(rolesData);
        keys.forEach((roleId, index) => {
            currentRow.addComponents(new ButtonBuilder().setCustomId(`role_${roleId}`).setLabel(rolesData[roleId].name).setEmoji(rolesData[roleId].emoji).setStyle(ButtonStyle.Primary));
            if ((index + 1) % 5 === 0 || index === keys.length - 1) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
        });
        await message.channel.send({ embeds: [embed], components: rows });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'للعمال فقط!', ephemeral: true });
        if (interaction.commandName === 'اضافه') {
            const role = interaction.options.getRole('رتبه');
            const emoji = interaction.options.getString('ملصق');
            rolesData[role.id] = { emoji, name: role.name };
            interaction.reply({ content: `✅ تم إضافة: ${role.name}`, ephemeral: true });
        } else if (interaction.commandName === 'حذف') {
            const role = interaction.options.getRole('رتبه');
            delete rolesData[role.id];
            interaction.reply({ content: `🗑️ تم حذف الرتبة.`, ephemeral: true });
        }
    }
    if (interaction.isButton() && interaction.customId.startsWith('role_')) {
        const roleId = interaction.customId.split('_')[1];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`yes_${roleId}`).setLabel('نعم').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`no_${roleId}`).setLabel('لا').setStyle(ButtonStyle.Danger)
        );
        interaction.reply({ content: `❓ هل تريد رتبة **${rolesData[roleId].name}**؟`, components: [row], ephemeral: true });
    }
    if (interaction.isButton() && (interaction.customId.startsWith('yes_') || interaction.customId.startsWith('no_'))) {
        const [action, roleId] = interaction.customId.split('_');
        if (action === 'yes') {
            try {
                await interaction.member.roles.add(roleId);
                interaction.update({ content: `✅ تم منحك رتبة **${rolesData[roleId].name}**!`, components: [] });
            } catch (e) { interaction.update({ content: '❌ خطأ: تأكد من ترتيب الرتب.', components: [] }); }
        } else { interaction.update({ content: '❌ تم الإلغاء.', components: [] }); }
    }
});

client.login(process.env.DISCORD_TOKEN);
