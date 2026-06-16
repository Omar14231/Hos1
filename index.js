require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const OWNER_ID = "1344009623887151155";

let rolesData = {}; // تخزين مؤقت للرتب (يمكنك ربطه بملف json للحفظ الدائم)
let configChannelId = null;

// تسجيل أوامر الـ Slash
const commands = [
    new SlashCommandBuilder().setName('اضافه').setDescription('إضافة رتبة جديدة').addStringOption(o => o.setName('ايموجي').setDescription('الايموجي').setRequired(true)).addRoleOption(o => o.setName('رتبه').setDescription('الرتبة').setRequired(true)),
    new SlashCommandBuilder().setName('حذف').setDescription('حذف رتبة').addRoleOption(o => o.setName('رتبه').setDescription('الرتبة').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('البوت جاهز!');
});

// معالجة الرسائل والاوامر
client.on('messageCreate', async message => {
    if (message.content === '!اعداد' && message.author.id === OWNER_ID) {
        configChannelId = message.channel.id;
        updateRoleEmbed(message.channel);
    }
});

// تحديث الرسالة
async function updateRoleEmbed(channel) {
    const embed = new EmbedBuilder().setTitle('اختر رتبتك').setDescription('اضغط على الزر للحصول على الرتبة');
    const rows = [];
    let currentRow = new ActionRowBuilder();

    Object.keys(rolesData).forEach((roleId, index) => {
        currentRow.addComponents(new ButtonBuilder().setCustomId(`role_${roleId}`).setLabel(' ').setEmoji(rolesData[roleId].emoji).setStyle(ButtonStyle.Primary));
        if ((index + 1) % 5 === 0) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
    });
    if (currentRow.components.length > 0) rows.push(currentRow);

    const msgs = await channel.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit({ embeds: [embed], components: rows });
    else await channel.send({ embeds: [embed], components: rows });
}

// التفاعل مع الأزرار
client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'المالك فقط!', ephemeral: true });
        
        if (interaction.commandName === 'اضافه') {
            const role = interaction.options.getRole('رتبه');
            const emoji = interaction.options.getString('ايموجي');
            rolesData[role.id] = { emoji, name: role.name };
            interaction.reply({ content: 'تم إضافة الرتبة', ephemeral: true });
        } else if (interaction.commandName === 'حذف') {
            const role = interaction.options.getRole('رتبه');
            delete rolesData[role.id];
            interaction.reply({ content: 'تم الحذف', ephemeral: true });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('role_')) {
        const roleId = interaction.customId.split('_')[1];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`yes_${roleId}`).setLabel('نعم').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`no_${roleId}`).setLabel('لا').setStyle(ButtonStyle.Danger)
        );
        interaction.reply({ content: `هل تريد الحصول على رتبة ${rolesData[roleId].name}؟`, components: [row], ephemeral: true });
    }

    if (interaction.isButton() && (interaction.customId.startsWith('yes_') || interaction.customId.startsWith('no_'))) {
        const [action, roleId] = interaction.customId.split('_');
        if (action === 'yes') await interaction.member.roles.add(roleId);
        interaction.update({ content: action === 'yes' ? 'تم منحك الرتبة!' : 'تم الإلغاء', components: [] });
    }
});

client.login(process.env.DISCORD_TOKEN);
