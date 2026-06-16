require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');

// --- إعداد خادم الويب ليظن رندر أن البوت موقع ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('البوت يعمل بكفاءة!'));
app.listen(port);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const OWNER_ID = "1344009623887151155";

let rolesData = {}; // تخزين مؤقت للرتب

const commands = [
    new SlashCommandBuilder().setName('اضافه').setDescription('إضافة رتبة جديدة').addStringOption(o => o.setName('ملصق').setDescription('ايموجي او ملصق الرتبة').setRequired(true)).addRoleOption(o => o.setName('رتبه').setDescription('اختر الرتبة').setRequired(true)),
    new SlashCommandBuilder().setName('حذف').setDescription('حذف رتبة من القائمة').addRoleOption(o => o.setName('رتبه').setDescription('اختر الرتبة').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`البوت يعمل كـ ${client.user.tag}`);
});

// التعامل مع أمر !اعداد
client.on('messageCreate', async message => {
    if (message.content === '!اعداد' && message.author.id === OWNER_ID) {
        // مسح رسائل البوت السابقة في الروم
        const fetched = await message.channel.messages.fetch({ limit: 50 });
        const botMessages = fetched.filter(m => m.author.id === client.user.id);
        await message.channel.bulkDelete(botMessages);

        const embed = new EmbedBuilder()
            .setTitle('🌟 الرتب المتاحة')
            .setDescription('اختر الرتبة التي تناسبك بالضغط على الزر أدناه:')
            .setColor(0x0099FF);

        const rows = [];
        let currentRow = new ActionRowBuilder();
        const keys = Object.keys(rolesData);
        
        keys.forEach((roleId, index) => {
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`role_${roleId}`)
                    .setLabel(rolesData[roleId].name)
                    .setEmoji(rolesData[roleId].emoji)
                    .setStyle(ButtonStyle.Primary)
            );
            if ((index + 1) % 5 === 0 || index === keys.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });

        await message.channel.send({ embeds: [embed], components: rows });
    }
});

// التعامل مع الأوامر والأزرار
client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'عذراً، هذا الأمر للمالك فقط!', ephemeral: true });

        if (interaction.commandName === 'اضافه') {
            const role = interaction.options.getRole('رتبه');
            const emoji = interaction.options.getString('ملصق');
            rolesData[role.id] = { emoji, name: role.name };
            interaction.reply({ content: `✅ تم إضافة الرتبة: ${role.name} مع الملصق ${emoji}`, ephemeral: true });
        } else if (interaction.commandName === 'حذف') {
            const role = interaction.options.getRole('رتبه');
            delete rolesData[role.id];
            interaction.reply({ content: `🗑️ تم حذف الرتبة ${role.name} من القائمة`, ephemeral: true });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('role_')) {
        const roleId = interaction.customId.split('_')[1];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`yes_${roleId}`).setLabel('نعم، أريدها').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`no_${roleId}`).setLabel('لا').setStyle(ButtonStyle.Danger)
        );
        interaction.reply({ content: `❓ هل أنت متأكد أنك تريد رتبة **${rolesData[roleId].name}**؟`, components: [row], ephemeral: true });
    }

    if (interaction.isButton() && (interaction.customId.startsWith('yes_') || interaction.customId.startsWith('no_'))) {
        const [action, roleId] = interaction.customId.split('_');
        if (action === 'yes') {
            await interaction.member.roles.add(roleId).catch(() => {});
            interaction.update({ content: `✅ تم منحك رتبة ${rolesData[roleId].name} بنجاح!`, components: [] });
        } else {
            interaction.update({ content: '❌ تم إلغاء الطلب.', components: [] });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
