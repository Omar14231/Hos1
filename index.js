// ====================================================
// 🔑 المفاتيح - أضفها في Render → Environment Variables
// ====================================================
// DISCORD_TOKEN  =  توكن البوت (من Discord Developer Portal)
// RENDER_URL     =  رابط السيرفر في Render (لتجديد كل 5 دقائق)
// ====================================================

const {
  Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ChannelType, REST, Routes, SlashCommandBuilder
} = require("discord.js");
const http = require("http");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const OWNER_ID = "1344009623887151155";
const TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_URL || "";

let ticketRoleId = null;
let ticketCategoryId = null;

// HTTP Server لـ Render
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot Running ✅");
}).listen(PORT, () => console.log(`🌐 HTTP على البورت ${PORT}`));

// Ping كل 5 دقائق لمنع النوم
if (RENDER_URL) {
  setInterval(() => {
    require("https").get(RENDER_URL, () => {}).on("error", () => {});
  }, 5 * 60 * 1000);
}

function fancy(title, desc, color = 0x9b59b6) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
}

// ============================
// تسجيل أمر /منشن
// ============================
client.once("clientReady", async () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("mention")
      .setDescription("منشن كل الأعضاء برسالة - للملك فقط")
      .addStringOption(opt =>
        opt.setName("text").setDescription("النص اللي تبي تمنشن فيه").setRequired(true)
      )
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ تم تسجيل أمر /mention");
  } catch (err) {
    console.error("❌ فشل تسجيل الأمر:", err);
  }
});

// ============================
// أوامر النص
// ============================
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (message.author.id !== OWNER_ID) return;

  const { content, channel } = message;
  const msg = content.trim();

  // !تكت
  if (msg === "!تكت") {
    await message.reply({
      embeds: [fancy("🎫 إعداد التذاكر", "منشن الرتبة المخصصة لمسؤولي التذاكر:", 0x9b59b6)]
    });

    const filter = m => m.author.id === OWNER_ID && m.mentions.roles.size > 0;
    const collector = channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on("collect", async m => {
      ticketRoleId = m.mentions.roles.first()?.id;
      ticketCategoryId = channel.parentId;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("open_ticket")
          .setLabel("📩 فتح تذكرة")
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [fancy("🎫 نظام التذاكر", "اضغط الزر أدناه لفتح تذكرة!\n\n**سيتم إنشاء روم خاص بك فوراً**", 0x9b59b6)],
        components: [row]
      });

      await m.reply({
        embeds: [fancy("✅ تم الإعداد", `رتبة المسؤولين: <@&${ticketRoleId}>\nجاهز لاستقبال التذاكر!`, 0x2ecc71)]
      });
    });

    collector.on("end", collected => {
      if (collected.size === 0) {
        channel.send({ embeds: [fancy("⏰ انتهى الوقت", "لم يتم تحديد الرتبة. أعد كتابة !تكت", 0xe74c3c)] });
      }
    });
    return;
  }
});

// ============================
// التفاعلات (أزرار + سلاش)
// ============================
client.on("interactionCreate", async interaction => {
  const { customId, user, guild, channel } = interaction;

  // ===== /mention - منشن الجميع =====
  if (interaction.isChatInputCommand() && interaction.commandName === "mention") {
    if (user.id !== OWNER_ID) {
      return interaction.reply({ content: "🚫 هذا الأمر للملك فقط!", ephemeral: true });
    }

    const text = interaction.options.getString("text");
    await interaction.deferReply();
    await guild.members.fetch();

    const members = guild.members.cache.filter(m => !m.user.bot);

    // تقسيم المنشنات لأجزاء (حد 2000 حرف)
    const chunks = [];
    let current = "";
    for (const m of members.values()) {
      const part = `<@${m.id}> `;
      if ((current + part).length > 1900) {
        chunks.push(current.trim());
        current = part;
      } else {
        current += part;
      }
    }
    if (current) chunks.push(current.trim());

    await interaction.editReply({
      embeds: [fancy("📢 منشن الجميع", `**الرسالة:** ${text}\n**من:** <@${user.id}>`, 0x9b59b6)]
    });

    for (const chunk of chunks) {
      await channel.send(chunk).catch(() => {});
    }

    await channel.send({ embeds: [fancy("📢 رسالة الملك", text, 0x9b59b6)] });
    return;
  }

  // ===== فتح تذكرة =====
  if (interaction.isButton() && customId === "open_ticket") {
    await interaction.deferReply({ ephemeral: true });

    const select = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_reason_${user.id}`)
        .setPlaceholder("اختر سبب فتح التذكرة")
        .addOptions([
          { label: "🆘 مشكلة تقنية", value: "technical" },
          { label: "💰 مشكلة في البنك", value: "bank" },
          { label: "⚔️ شكوى ضد عضو", value: "report" },
          { label: "💡 اقتراح", value: "suggestion" },
          { label: "❓ استفسار", value: "other" },
        ])
    );

    await interaction.editReply({
      embeds: [fancy("🎫 فتح تذكرة", "اختر سبب التذكرة:")],
      components: [select]
    });
    return;
  }

  // ===== سبب التذكرة =====
  if (interaction.isStringSelectMenu() && customId.startsWith("ticket_reason_")) {
    await interaction.deferReply({ ephemeral: true });

    const reason = interaction.values[0];
    const reasonText = {
      technical: "🆘 مشكلة تقنية",
      bank: "💰 مشكلة بنك",
      report: "⚔️ شكوى ضد عضو",
      suggestion: "💡 اقتراح",
      other: "❓ استفسار"
    }[reason];

    const ticketChannel = await guild.channels.create({
      name: `تذكرة-${user.username}`,
      type: ChannelType.GuildText,
      parent: ticketCategoryId || null,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        ...(ticketRoleId ? [{
          id: ticketRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }] : []),
        {
          id: OWNER_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
      ]
    }).catch(() => null);

    if (!ticketChannel) {
      return interaction.editReply({ content: "❌ فشل إنشاء التذكرة! تأكد من صلاحيات البوت." });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_mention_${ticketChannel.id}`).setLabel("📢 منشن مسؤول").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket_escalate_${ticketChannel.id}`).setLabel("⬆️ رفع للملك").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_claim_${ticketChannel.id}`).setLabel("✋ استلام التذكرة").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_close_${ticketChannel.id}`).setLabel("🔒 قفل").setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `<@${user.id}> ${ticketRoleId ? `<@&${ticketRoleId}>` : ""}`,
      embeds: [fancy(
        "🎫 تذكرة جديدة",
        `**العضو:** <@${user.id}>\n**السبب:** ${reasonText}\n\nأهلاً! اشرح مشكلتك وسيتم الرد عليك قريباً.`,
        0x9b59b6
      )],
      components: [row]
    });

    await interaction.editReply({ content: `✅ تم فتح تذكرتك: <#${ticketChannel.id}>` });
    return;
  }

  // ===== منشن مسؤول =====
  if (interaction.isButton() && customId.startsWith("ticket_mention_")) {
    const mention = ticketRoleId ? `<@&${ticketRoleId}>` : `<@${OWNER_ID}>`;
    await interaction.reply({
      content: `${mention} لديك تذكرة تحتاج اهتمام!`,
      embeds: [fancy("📢 منشن", `<@${user.id}> طلب مساعدة مسؤول.`, 0x3498db)]
    });
    return;
  }

  // ===== رفع للملك =====
  if (interaction.isButton() && customId.startsWith("ticket_escalate_")) {
    const isStaff = ticketRoleId && interaction.member.roles.cache.has(ticketRoleId);
    if (!isStaff && user.id !== OWNER_ID) {
      return interaction.reply({ content: "🚫 للمسؤولين فقط!", ephemeral: true });
    }
    await interaction.reply({
      content: `<@${OWNER_ID}> تم تصعيد هذه التذكرة إليك!`,
      embeds: [fancy("⬆️ تصعيد للملك", `المسؤول <@${user.id}> رفع التذكرة للملك.`, 0xf39c12)]
    });
    return;
  }

  // ===== استلام التذكرة =====
  if (interaction.isButton() && customId.startsWith("ticket_claim_")) {
    const isStaff = ticketRoleId && interaction.member.roles.cache.has(ticketRoleId);
    if (!isStaff && user.id !== OWNER_ID) {
      return interaction.reply({ content: "🚫 للمسؤولين فقط!", ephemeral: true });
    }
    const chanId = customId.replace("ticket_claim_", "");
    await interaction.reply({
      embeds: [fancy("✋ تم الاستلام", `<@${user.id}> استلم هذه التذكرة وسيتولى المساعدة.`, 0x2ecc71)]
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_mention_${chanId}`).setLabel("📢 منشن مسؤول").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket_escalate_${chanId}`).setLabel("⬆️ رفع للملك").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_claim_${chanId}`).setLabel(`✅ استلم: ${user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId(`ticket_close_${chanId}`).setLabel("🔒 قفل").setStyle(ButtonStyle.Danger)
    );
    await interaction.message.edit({ components: [row] }).catch(() => {});
    return;
  }

  // ===== قفل التذكرة =====
  if (interaction.isButton() && customId.startsWith("ticket_close_")) {
    const isStaff = ticketRoleId && interaction.member.roles.cache.has(ticketRoleId);
    if (!isStaff && user.id !== OWNER_ID) {
      return interaction.reply({ content: "🚫 للمسؤولين فقط!", ephemeral: true });
    }
    await interaction.reply({
      embeds: [fancy("🔒 قفل التذكرة", `تم القفل بواسطة <@${user.id}>.\nسيتم الحذف خلال 5 ثوانٍ...`, 0xe74c3c)]
    });
    setTimeout(async () => {
      await channel.delete().catch(() => {});
    }, 5000);
    return;
  }
});

// ============================
// تشغيل
// ============================
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN غير موجود في متغيرات البيئة!");
  process.exit(1);
}

client.login(TOKEN);
