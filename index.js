const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ========================
//   إعدادات البوت
// ========================
const KING_ID = "1344009623887151155"; // الملك الأصلي
const kings = new Set([KING_ID]);      // مجموعة الملوك (يمكن إضافة أصدقاء)

// قاعدة البيانات في الذاكرة
const balances = {};    // { userId: number }
const storage = {};     // { userId: number } — المخزنة
let supportRoleId = null; // رتبة الدعم
let ticketCategoryId = null; // كاتيجوري التذاكر
let ticketCounter = 0;

// ========================
//   مساعدات
// ========================
function isKing(userId) {
  return kings.has(userId);
}

function getBalance(userId) {
  return balances[userId] || 0;
}

function getStorage(userId) {
  return storage[userId] || 0;
}

function parseAmount(str) {
  if (!str) return NaN;
  // تحويل الأرقام العربية للإنجليزية
  str = str
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/,/g, "")
    .trim()
    .toLowerCase();
  // دعم k و K
  if (str.endsWith("k")) {
    return parseFloat(str) * 1000;
  }
  return parseFloat(str);
}

function formatAmount(num) {
  if (num >= 1000) {
    return (num / 1000).toLocaleString("ar-SA") + "k ريال";
  }
  return num.toLocaleString("ar-SA") + " ريال";
}

// ========================
//   الأحداث
// ========================
client.once("ready", () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const args = content.split(/\s+/);
  const cmd = args[0];
  const userId = message.author.id;

  // ============================================================
  //  !أبدأ٧٧  — للملك فقط: إعداد روم التذاكر
  // ============================================================
  if (cmd === "!أبدأ٧٧") {
    if (!isKing(userId)) return;

    await message.delete().catch(() => {});

    // اسأل عن رتبة الدعم
    const askMsg = await message.channel.send({
      content: `<@${userId}> منشن رتبة الدعم البنك المخصصة للتذاكر 👇`,
    });

    const filter = (m) => m.author.id === userId && m.mentions.roles.size > 0;
    const collector = message.channel.createMessageCollector({
      filter,
      time: 60000,
      max: 1,
    });

    collector.on("collect", async (m) => {
      const role = m.mentions.roles.first();
      supportRoleId = role.id;
      await m.delete().catch(() => {});
      await askMsg.delete().catch(() => {});

      // احفظ الكاتيجوري الحالي
      ticketCategoryId = message.channel.parentId;

      // إرسال الإمبيد مع زر فتح التذكرة
      const embed = new EmbedBuilder()
        .setTitle("🏦 دعم البنك الفني")
        .setDescription(
          "مرحباً بك في نظام دعم البنك\n\n" +
            "📌 هذا الروم مخصص لفتح تذاكر الدعم الفني\n" +
            "🔧 في حال وجود أي خطأ تقني أو استفسار، اضغط على الزر أدناه لفتح تذكرة دعم\n\n" +
            "⚠️ يُرجى توضيح المشكلة بدقة لتسريع المساعدة"
        )
        .setColor(0x2b2d31)
        .setFooter({ text: "البنك الرسمي • نظام التذاكر" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("open_ticket")
          .setLabel("📩 فتح تذكرة دعم")
          .setStyle(ButtonStyle.Primary)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
    });

    collector.on("end", (collected) => {
      if (collected.size === 0) {
        message.channel
          .send("⏰ انتهى الوقت، أعد الأمر مرة ثانية.")
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
      }
    });

    return;
  }

  // ============================================================
  //  -ارسال @منشن مبلغ — للملك فقط
  // ============================================================
  if (cmd === "-ارسال") {
    if (!isKing(userId)) return;

    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);

    if (!target || isNaN(amount) || amount <= 0) {
      return sendTemp(message, "❌ الاستخدام: `-ارسال @شخص المبلغ`");
    }

    balances[target.id] = getBalance(target.id) + amount;

    const embed = new EmbedBuilder()
      .setTitle("💸 تحويل ناجح")
      .setColor(0x57f287)
      .addFields(
        { name: "المستلم", value: `<@${target.id}>`, inline: true },
        { name: "المبلغ", value: formatAmount(amount), inline: true },
        {
          name: "الرصيد الجديد",
          value: formatAmount(getBalance(target.id)),
          inline: true,
        }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    // إشعار في الخاص
    await target
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle("💰 وصلك تحويل!")
            .setColor(0x57f287)
            .setDescription(
              `تم إيداع **${formatAmount(amount)}** في حسابك\nرصيدك الحالي: **${formatAmount(getBalance(target.id))}**`
            )
            .setTimestamp(),
        ],
      })
      .catch(() => {});

    return;
  }

  // ============================================================
  //  -رصيد [@منشن] — للجميع
  // ============================================================
  if (cmd === "-رصيد") {
    const target = message.mentions.users.first() || message.author;
    const bal = getBalance(target.id);

    const embed = new EmbedBuilder()
      .setTitle("🏦 رصيد الحساب")
      .setColor(0xfee75c)
      .addFields(
        { name: "العضو", value: `<@${target.id}>`, inline: true },
        { name: "الرصيد", value: formatAmount(bal), inline: true }
      )
      .setFooter({ text: "البنك الرسمي" })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ============================================================
  //  -سحب @منشن مبلغ — للملك فقط
  // ============================================================
  if (cmd === "-سحب") {
    if (!isKing(userId)) return;

    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);

    if (!target || isNaN(amount) || amount <= 0) {
      return sendTemp(message, "❌ الاستخدام: `-سحب @شخص المبلغ`");
    }

    if (getBalance(target.id) < amount) {
      return sendTemp(message, `❌ رصيد <@${target.id}> غير كافٍ`);
    }

    balances[target.id] = getBalance(target.id) - amount;

    const embed = new EmbedBuilder()
      .setTitle("🏧 سحب")
      .setColor(0xed4245)
      .addFields(
        { name: "العضو", value: `<@${target.id}>`, inline: true },
        { name: "المسحوب", value: formatAmount(amount), inline: true },
        {
          name: "الرصيد الجديد",
          value: formatAmount(getBalance(target.id)),
          inline: true,
        }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    await target
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏧 تم سحب من حسابك")
            .setColor(0xed4245)
            .setDescription(
              `تم سحب **${formatAmount(amount)}** من حسابك\nرصيدك الحالي: **${formatAmount(getBalance(target.id))}**`
            )
            .setTimestamp(),
        ],
      })
      .catch(() => {});

    return;
  }

  // ============================================================
  //  -تحويل @منشن مبلغ — للجميع
  // ============================================================
  if (cmd === "-تحويل") {
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);

    if (!target || isNaN(amount) || amount <= 0) {
      return sendTemp(message, "❌ الاستخدام: `-تحويل @شخص المبلغ`");
    }

    if (target.id === userId) {
      return sendTemp(message, "❌ لا تقدر تحول لنفسك");
    }

    if (getBalance(userId) < amount) {
      return sendTemp(message, "❌ رصيدك غير كافٍ");
    }

    balances[userId] = getBalance(userId) - amount;
    balances[target.id] = getBalance(target.id) + amount;

    const embed = new EmbedBuilder()
      .setTitle("💸 تحويل ناجح")
      .setColor(0x57f287)
      .addFields(
        { name: "من", value: `<@${userId}>`, inline: true },
        { name: "إلى", value: `<@${target.id}>`, inline: true },
        { name: "المبلغ", value: formatAmount(amount), inline: true }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    await target
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle("💰 وصلك تحويل!")
            .setColor(0x57f287)
            .setDescription(
              `حوّل لك <@${userId}> مبلغ **${formatAmount(amount)}**\nرصيدك الحالي: **${formatAmount(getBalance(target.id))}**`
            )
            .setTimestamp(),
        ],
      })
      .catch(() => {});

    return;
  }

  // ============================================================
  //  !مخزنة @منشن مبلغ — للملك فقط
  // ============================================================
  if (cmd === "!مخزنة") {
    if (!isKing(userId)) return;

    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);

    if (!target || isNaN(amount) || amount <= 0) {
      return sendTemp(message, "❌ الاستخدام: `!مخزنة @شخص المبلغ`");
    }

    storage[target.id] = getStorage(target.id) + amount;

    const embed = new EmbedBuilder()
      .setTitle("🗄️ تم الحفظ في المخزنة")
      .setColor(0x5865f2)
      .addFields(
        { name: "العضو", value: `<@${target.id}>`, inline: true },
        { name: "المضاف", value: formatAmount(amount), inline: true },
        {
          name: "إجمالي المخزنة",
          value: formatAmount(getStorage(target.id)),
          inline: true,
        }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ============================================================
  //  !جيب @منشن مبلغ — للملك فقط
  // ============================================================
  if (cmd === "!جيب") {
    if (!isKing(userId)) return;

    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);

    if (!target || isNaN(amount) || amount <= 0) {
      return sendTemp(message, "❌ الاستخدام: `!جيب @شخص المبلغ`");
    }

    if (getStorage(target.id) < amount) {
      return sendTemp(
        message,
        `❌ المبلغ غير كافٍ في الخزنة الخاصة بـ <@${target.id}>\nالمتوفر: **${formatAmount(getStorage(target.id))}**`
      );
    }

    storage[target.id] = getStorage(target.id) - amount;
    balances[target.id] = getBalance(target.id) + amount;

    const embed = new EmbedBuilder()
      .setTitle("📦 سحب من المخزنة")
      .setColor(0x57f287)
      .addFields(
        { name: "العضو", value: `<@${target.id}>`, inline: true },
        { name: "المسحوب", value: formatAmount(amount), inline: true },
        {
          name: "المخزنة المتبقية",
          value: formatAmount(getStorage(target.id)),
          inline: true,
        },
        {
          name: "الرصيد الجديد",
          value: formatAmount(getBalance(target.id)),
          inline: true,
        }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ============================================================
  //  -تعال @منشن — للجميع: البوت يمنشن الشخص في الخاص
  // ============================================================
  if (cmd === "-تعال") {
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message, "❌ الاستخدام: `-تعال @شخص`");

    await target
      .send(
        `👋 مرحباً! طلب منك <@${userId}> في سيرفر **${message.guild.name}** أن تحضر!\n📍 الروم: ${message.channel.url}`
      )
      .then(() => {
        sendTemp(message, `✅ تم إشعار <@${target.id}> في الخاص`);
      })
      .catch(() => {
        sendTemp(
          message,
          `❌ ما قدرت أوصل لـ <@${target.id}> في الخاص (ربما أغلق الرسائل الخاصة)`
        );
      });

    return;
  }

  // ============================================================
  //  -صديق @منشن — للملك فقط: يعطيه نفس صلاحيات الملك
  // ============================================================
  if (cmd === "-صديق") {
    if (!isKing(userId)) return;

    const target = message.mentions.users.first();
    if (!target) return sendTemp(message, "❌ الاستخدام: `-صديق @شخص`");

    if (kings.has(target.id)) {
      return sendTemp(message, `ℹ️ <@${target.id}> أصلاً لديه صلاحيات الملك`);
    }

    // طلب تأكيد
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_friend_${target.id}`)
        .setLabel("✅ نعم، أؤكد")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("cancel_friend")
        .setLabel("❌ إلغاء")
        .setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({
      content: `<@${userId}> هل أنت متأكد أنك تريد منح **<@${target.id}>** نفس صلاحياتك الملكية؟\nسيصبح قادراً على استخدام جميع الأوامر.`,
      components: [confirmRow],
    });

    return;
  }
});

// ============================================================
//  تفاعلات الأزرار والمودالز
// ============================================================
client.on("interactionCreate", async (interaction) => {

  // ===== تأكيد الصديق =====
  if (interaction.isButton() && interaction.customId.startsWith("confirm_friend_")) {
    if (!isKing(interaction.user.id)) {
      return interaction.reply({ content: "❌ ليس لديك صلاحية", ephemeral: true });
    }
    const targetId = interaction.customId.replace("confirm_friend_", "");
    kings.add(targetId);
    await interaction.update({
      content: `✅ تم منح <@${targetId}> صلاحيات الملك بنجاح!`,
      components: [],
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "cancel_friend") {
    await interaction.update({ content: "❌ تم إلغاء العملية", components: [] });
    return;
  }

  // ===== فتح التذكرة: مودال =====
  if (interaction.isButton() && interaction.customId === "open_ticket") {
    const modal = new ModalBuilder()
      .setCustomId("ticket_modal")
      .setTitle("فتح تذكرة دعم");

    const reasonInput = new TextInputBuilder()
      .setCustomId("ticket_reason")
      .setLabel("اكتب سبب فتحك للتذكرة")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("اشرح مشكلتك أو استفسارك بالتفصيل...")
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
    return;
  }

  // ===== استلام المودال وإنشاء روم التذكرة =====
  if (interaction.isModalSubmit() && interaction.customId === "ticket_modal") {
    const reason = interaction.fields.getTextInputValue("ticket_reason");
    const user = interaction.user;
    const guild = interaction.guild;

    ticketCounter++;
    const ticketNum = String(ticketCounter).padStart(4, "0");

    // اسم الروم بخط مميز
    const channelName = `𝗧𝗶𝗰𝗸𝗲𝘁-${ticketNum}-${user.username}`.slice(0, 100);

    // صلاحيات الروم
    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ];

    // إضافة رتبة الدعم لو موجودة
    if (supportRoleId) {
      permissionOverwrites.push({
        id: supportRoleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
        ],
      });
    }

    let ticketChannel;
    try {
      ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategoryId || null,
        permissionOverwrites,
      });
    } catch {
      return interaction.reply({
        content: "❌ حدث خطأ أثناء إنشاء التذكرة، تأكد من صلاحيات البوت",
        ephemeral: true,
      });
    }

    // رسالة داخل روم التذكرة
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`📋 تذكرة #${ticketNum}`)
      .setColor(0x5865f2)
      .setDescription(
        `مرحباً <@${user.id}>! تم فتح تذكرتك بنجاح\n\n**سبب التذكرة:**\n${reason}`
      )
      .addFields({ name: "الحالة", value: "🟡 قيد الانتظار", inline: true })
      .setFooter({ text: `التذكرة #${ticketNum}` })
      .setTimestamp();

    const supportMention = supportRoleId ? `<@&${supportRoleId}>` : "";

    const ticketRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ping_owner_${ticketChannel.id}`)
        .setLabel("📢 منشن الأونر")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ping_support_${ticketChannel.id}`)
        .setLabel("🔔 منشن الدعم")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`claim_ticket_${ticketChannel.id}`)
        .setLabel("✋ استلام")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`delete_ticket_${ticketChannel.id}`)
        .setLabel("🗑️ حذف التذكرة")
        .setStyle(ButtonStyle.Secondary)
    );

    await ticketChannel.send({
      content: `${supportMention} <@${user.id}>`,
      embeds: [ticketEmbed],
      components: [ticketRow],
    });

    await interaction.reply({
      content: `✅ تم فتح تذكرتك في ${ticketChannel}`,
      ephemeral: true,
    });
    return;
  }

  // ===== أزرار داخل التذكرة =====

  // منشن الدعم — مسموح للعضو مرة واحدة
  if (interaction.isButton() && interaction.customId.startsWith("ping_support_")) {
    if (!supportRoleId) {
      return interaction.reply({ content: "❌ رتبة الدعم غير محددة", ephemeral: true });
    }
    // نتحقق لو العضو استخدمه قبل (نحفظه في اسم المتغير)
    const key = `pinged_${interaction.channel.id}_${interaction.user.id}`;
    if (!isKing(interaction.user.id) && !hasRole(interaction, supportRoleId)) {
      // عضو عادي — مرة واحدة
      if (global[key]) {
        return interaction.reply({
          content: "❌ لا يمكنك منشنة الدعم أكثر من مرة",
          ephemeral: true,
        });
      }
      global[key] = true;
    }
    await interaction.reply({ content: `<@&${supportRoleId}>` });
    return;
  }

  // منشن الأونر — للدعم فقط
  if (interaction.isButton() && interaction.customId.startsWith("ping_owner_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id)) {
      return interaction.reply({
        content: "❌ هذا الزر للدعم فقط",
        ephemeral: true,
      });
    }
    // منشن جميع الملوك
    const mentions = [...kings].map((id) => `<@${id}>`).join(" ");
    await interaction.reply({ content: `${mentions} 📢 طلب من الدعم` });
    return;
  }

  // استلام التذكرة — للدعم فقط
  if (interaction.isButton() && interaction.customId.startsWith("claim_ticket_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id)) {
      return interaction.reply({
        content: "❌ هذا الزر للدعم فقط",
        ephemeral: true,
      });
    }
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`✅ تم استلام التذكرة من قِبَل <@${interaction.user.id}>`);
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // حذف التذكرة — للدعم فقط
  if (interaction.isButton() && interaction.customId.startsWith("delete_ticket_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id)) {
      return interaction.reply({
        content: "❌ هذا الزر للدعم فقط",
        ephemeral: true,
      });
    }
    await interaction.reply({ content: "🗑️ سيتم حذف التذكرة خلال 5 ثوانٍ..." });
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
    return;
  }
});

// ========================
//   مساعد: رسالة مؤقتة
// ========================
async function sendTemp(message, text, delay = 5000) {
  const m = await message.channel.send(text);
  setTimeout(() => m.delete().catch(() => {}), delay);
}

// ========================
//   مساعد: التحقق من الرتبة
// ========================
function hasRole(interaction, roleId) {
  if (!roleId) return false;
  return interaction.member?.roles?.cache?.has(roleId);
}

// ========================
//   تشغيل البوت
// ========================
client.login(process.env.DISCORD_TOKEN);
