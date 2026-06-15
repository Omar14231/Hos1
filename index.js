const {
  Client, GatewayIntentBits, Partials,
  PermissionsBitField, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType,
} = require("discord.js");
const http = require("http");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ══════════════════════════════════════════════
//  إعدادات
// ══════════════════════════════════════════════
const KING_ID = "1344009623887151155";
const kings   = new Set([KING_ID]);

const balances  = {};
const storage   = {};
const cooldowns = {};

let supportRoleId    = null;
let ticketCategoryId = null;
let ticketCounter    = 0;
let bankChannelId    = null;

// ══════════════════════════════════════════════
//  مساعدات
// ══════════════════════════════════════════════
const isKing     = id => kings.has(id);
const getBalance = id => balances[id] || 0;
const getStorage = id => storage[id]  || 0;

function parseAmount(str) {
  if (!str) return NaN;
  str = str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
           .replace(/,/g, "").trim().toLowerCase();
  if (str.endsWith("k")) return parseFloat(str) * 1000;
  return parseFloat(str);
}

function formatAmount(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M ريال";
  if (num >= 1000)    return (num / 1000).toFixed(1)    + "k ريال";
  return num.toLocaleString("ar-SA") + " ريال";
}

function formatMs(ms) { return `${Math.ceil(ms / 60000)} دقيقة`; }

async function sendTemp(channel, text, delay = 6000) {
  const m = await channel.send(text).catch(() => null);
  if (m) setTimeout(() => m.delete().catch(() => {}), delay);
}

function checkCooldown(userId, cmd, ms) {
  const key    = `${userId}_${cmd}`;
  const expiry = cooldowns[key] || 0;
  const now    = Date.now();
  if (now < expiry) return { ok: false, remaining: expiry - now };
  cooldowns[key] = now + ms;
  return { ok: true };
}

function hasRole(interaction, roleId) {
  if (!roleId) return false;
  return interaction.member?.roles?.cache?.has(roleId);
}

// ══════════════════════════════════════════════
//  لعبة الألوان — ألوان Unicode boxes
//  نستخدم مربعات ملونة Unicode لتكون مثل الصورة تماماً
// ══════════════════════════════════════════════

// الألوان كـ emojis واضحة
const COLORS = {
  yellow: "🟨",
  purple: "🟪",
  brown:  "🟫",
  blue:   "🟦",
  red:    "🟥",
};
const COLOR_LIST = ["yellow", "purple", "brown", "blue", "red"];

// أسماء الألوان بالعربي
const COLOR_NAMES_AR = {
  yellow: "🟨 أصفر",
  purple: "🟪 بنفسجي",
  brown:  "🟫 بني",
  blue:   "🟦 أزرق",
  red:    "🟥 أحمر",
};

// توليد لوحة 10×10 مثل الصورة (الأصفر يسيطر ~60%)
function generateColorBoard() {
  const board = [];
  for (let r = 0; r < 10; r++) {
    const row = [];
    for (let c = 0; c < 10; c++) {
      if (Math.random() < 0.60) {
        row.push("yellow");
      } else {
        const others = COLOR_LIST.filter(c => c !== "yellow");
        row.push(others[Math.floor(Math.random() * others.length)]);
      }
    }
    board.push(row);
  }
  return board;
}

// تحويل اللوحة لنص emojis
function boardToString(board) {
  return board.map(row => row.map(c => COLORS[c]).join("")).join("\n");
}

// عد لون معين في اللوحة
function countColor(board, color) {
  return board.flat().filter(c => c === color).length;
}

// ══════════════════════════════════════════════
//  جلسات الألوان
// ══════════════════════════════════════════════
const colorSessions = {};

// ══════════════════════════════════════════════
//  READY
// ══════════════════════════════════════════════
client.once("clientReady", () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
});

// ══════════════════════════════════════════════
//  messageCreate
// ══════════════════════════════════════════════
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const args    = content.split(/\s+/);
  const cmd     = args[0];
  const userId  = message.author.id;

  // ══════════════════════
  //  !روم — للملوك
  //  يحفظ الروم ويحذف الرسالة، ويرسل embed الأوامر
  // ══════════════════════
  if (args[0] === "!روم") {
    if (!isKing(userId)) return;
    bankChannelId = message.channel.id;
    // احذف رسالة الملك فوراً
    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle("🏦 البنك الرسمي")
      .setColor(0x5865f2)
      .setDescription(
        "**الأوامر :**\n\n" +
        "> `الوان` — ايموجي — كراش — نرد — زر —\n" +
        "> `تحدي` — أرقام — لعبة — سلوت — استثمار\n" +
        "> `تداول` — اكس-او — خمن — فواكه —\n" +
        "> `اختباء` — مخاطرة — نمط"
      )
      .setFooter({ text: "البنك الرسمي • حظ سعيد 🍀" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("show_bank_commands")
        .setLabel("‹ اختر القسم")
        .setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  // ── أوامر البنك تعمل فقط في روم البنك
  const bankCmds = ["راتب", "الوان", "نهب", "لعبه", "ماين", "صاروخ"];
  if (bankCmds.includes(args[0]) && bankChannelId && message.channel.id !== bankChannelId) {
    return sendTemp(message.channel, `❌ استخدم أوامر البنك في <#${bankChannelId}> فقط!`);
  }

  // ══════════════════════
  //  راتب
  // ══════════════════════
  if (args[0] === "راتب") {
    const cd = checkCooldown(userId, "راتب", (Math.floor(Math.random() * 6) + 5) * 60000);
    if (!cd.ok) return sendTemp(message.channel, `⏳ <@${userId}> انتظر **${formatMs(cd.remaining)}** للراتب!`);

    const amount = Math.floor(Math.random() * (1578 - 100 + 1)) + 100;
    balances[userId] = getBalance(userId) + amount;

    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("💵 راتبك وصل!")
        .setColor(0x57f287)
        .setDescription(`<@${userId}> استلمت **${formatAmount(amount)}**\n🏦 رصيدك: **${formatAmount(getBalance(userId))}**`)
        .setTimestamp()]
    });
    return;
  }

  // ══════════════════════
  //  الوان — لعبة الألوان (زي الصورة بالضبط)
  // ══════════════════════
  if (args[0] === "الوان") {
    if (colorSessions[message.channel.id]) {
      return sendTemp(message.channel, "❌ في لعبة ألوان شغالة الحين!");
    }
    const cd = checkCooldown(userId, "الوان", (Math.floor(Math.random() * 6) + 5) * 60000);
    if (!cd.ok) return sendTemp(message.channel, `⏳ <@${userId}> انتظر **${formatMs(cd.remaining)}**!`);

    const board        = generateColorBoard();
    const maxAttempts  = 19;
    const prize        = Math.floor(Math.random() * 1500) + 300;

    // اختر لون هدف عشوائي (ليس الأصفر دائماً لتكون اللعبة ممتعة)
    const targetColor  = COLOR_LIST[Math.floor(Math.random() * COLOR_LIST.length)];
    const correctCount = countColor(board, targetColor);

    const boardStr = boardToString(board);

    const embed = new EmbedBuilder()
      .setTitle("الوان")
      .setColor(0x2b2d31)
      .setDescription(boardStr)
      .addFields(
        { name: "عدد المحاولات :", value: `0/${maxAttempts}`, inline: true },
        { name: "⏰ الوقت :", value: "2 دقائق", inline: true }
      )
      .setFooter({ text: `💰 الجائزة: ${formatAmount(prize)} | اختر كم مرة يظهر اللون المطلوب!` })
      .setTimestamp();

    // أزرار الألوان (زي الصورة: 4 في صف + واحد منفرد)
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_purple`).setLabel("🟪").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_yellow`).setLabel("🟨").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_brown`).setLabel("🟫").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_blue`).setLabel("🟦").setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_red`).setLabel("🟥").setStyle(ButtonStyle.Danger),
    );

    const msg = await message.channel.send({
      content: `<@${userId}> — **كم عدد ${COLORS[targetColor]} في اللوحة؟**`,
      embeds: [embed],
      components: [row1, row2]
    });

    colorSessions[message.channel.id] = {
      board, userId,
      attempts: 0, maxAttempts,
      target: targetColor,
      correct: correctCount,
      prize,
      startTime: Date.now(),
      msgId: msg.id,
    };

    // timeout بعد دقيقتين
    setTimeout(async () => {
      if (!colorSessions[message.channel.id] || colorSessions[message.channel.id].msgId !== msg.id) return;
      delete colorSessions[message.channel.id];
      await msg.edit({
        content: null,
        embeds: [new EmbedBuilder()
          .setTitle("⏰ انتهى الوقت!")
          .setColor(0xed4245)
          .setDescription(`الجواب كان **${correctCount}** خانة ${COLORS[targetColor]}`)
          .setTimestamp()],
        components: []
      }).catch(() => {});
    }, 2 * 60 * 1000);

    return;
  }

  // ══════════════════════
  //  نهب @شخص
  // ══════════════════════
  if (args[0] === "نهب") {
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message.channel, "❌ الاستخدام: `نهب @شخص`");
    if (target.id === userId) return sendTemp(message.channel, "❌ ما تنهب نفسك!");
    if (getBalance(target.id) <= 0) return sendTemp(message.channel, `❌ <@${target.id}> ما عنده رصيد!`);

    const cd = checkCooldown(userId, "نهب", (Math.floor(Math.random() * 6) + 5) * 60000);
    if (!cd.ok) return sendTemp(message.channel, `⏳ انتظر **${formatMs(cd.remaining)}**!`);

    const success = Math.random() > 0.45;
    if (success) {
      const stolen = Math.floor(getBalance(target.id) * (Math.random() * 0.3 + 0.1));
      balances[userId]    = getBalance(userId) + stolen;
      balances[target.id] = getBalance(target.id) - stolen;
      await message.channel.send({
        embeds: [new EmbedBuilder().setTitle("⚔️ نهب ناجح! 🎉").setColor(0xff9d00)
          .setDescription(`<@${userId}> نهب <@${target.id}>`)
          .addFields(
            { name: "💰 المنهوب", value: formatAmount(stolen), inline: true },
            { name: "🏦 رصيدك",   value: formatAmount(getBalance(userId)), inline: true }
          ).setTimestamp()]
      });
    } else {
      const fine = Math.floor(getBalance(userId) * 0.1);
      balances[userId] = getBalance(userId) - fine;
      await message.channel.send({
        embeds: [new EmbedBuilder().setTitle("⚔️ النهب فشل! 😅").setColor(0xed4245)
          .setDescription(`<@${userId}> انكشف وخسر **${formatAmount(fine)}** كغرامة`)
          .addFields({ name: "🏦 رصيدك", value: formatAmount(getBalance(userId)), inline: true })
          .setTimestamp()]
      });
    }
    return;
  }

  // ══════════════════════
  //  ماين
  // ══════════════════════
  if (args[0] === "ماين") {
    const cd = checkCooldown(userId, "ماين", (Math.floor(Math.random() * 6) + 5) * 60000);
    if (!cd.ok) return sendTemp(message.channel, `⏳ انتظر **${formatMs(cd.remaining)}**!`);

    const win    = Math.random() > 0.3;
    const amount = Math.floor(Math.random() * 850) + 50;

    if (win) {
      balances[userId] = getBalance(userId) + amount;
      await message.channel.send({
        embeds: [new EmbedBuilder().setTitle("⛏️ تعدين ناجح!").setColor(0xfee75c)
          .setDescription(`<@${userId}> حفرت ولقيت كنز!`)
          .addFields(
            { name: "💎 الربح",  value: formatAmount(amount), inline: true },
            { name: "🏦 الرصيد", value: formatAmount(getBalance(userId)), inline: true }
          ).setTimestamp()]
      });
    } else {
      const loss = Math.min(Math.floor(Math.random() * 300) + 50, getBalance(userId));
      balances[userId] = getBalance(userId) - loss;
      await message.channel.send({
        embeds: [new EmbedBuilder().setTitle("⛏️ الحفرة انهارت!").setColor(0xed4245)
          .setDescription(`<@${userId}> خسرت **${formatAmount(loss)}**`)
          .addFields({ name: "🏦 الرصيد", value: formatAmount(getBalance(userId)), inline: true })
          .setTimestamp()]
      });
    }
    return;
  }

  // ══════════════════════
  //  صاروخ مبلغ
  // ══════════════════════
  if (args[0] === "صاروخ") {
    const bet = parseAmount(args[1]);
    if (isNaN(bet) || bet <= 0) return sendTemp(message.channel, "❌ الاستخدام: `صاروخ المبلغ`");
    if (getBalance(userId) < bet) return sendTemp(message.channel, "❌ رصيدك ما يكفي!");

    const cd = checkCooldown(userId, "صاروخ", (Math.floor(Math.random() * 6) + 5) * 60000);
    if (!cd.ok) return sendTemp(message.channel, `⏳ انتظر **${formatMs(cd.remaining)}**!`);

    const mults = [0, 0.5, 1.5, 2, 2.5, 3];
    const mult  = mults[Math.floor(Math.random() * mults.length)];
    const gain  = Math.floor(bet * mult);
    balances[userId] = getBalance(userId) - bet + gain;

    let color, title;
    if (mult === 0)     { color = 0xed4245; title = "🚀💥 الصاروخ انفجر!"; }
    else if (mult < 1)  { color = 0xff9d00; title = "🚀 هبط مبكر..";       }
    else if (mult >= 3) { color = 0x57f287; title = "🚀🌟 وصل الفضاء!";    }
    else                { color = 0x57f287; title = "🚀 الصاروخ طار!";     }

    await message.channel.send({
      embeds: [new EmbedBuilder().setTitle(title).setColor(color)
        .setDescription(`<@${userId}> ضرب **${mult}x** ← ${formatAmount(gain)}`)
        .addFields(
          { name: "💵 الرهان",  value: formatAmount(bet), inline: true },
          { name: "🏦 الرصيد", value: formatAmount(getBalance(userId)), inline: true }
        ).setTimestamp()]
    });
    return;
  }

  // ══════════════════════
  //  لعبه — فردي/زوجي
  // ══════════════════════
  if (args[0] === "لعبه") {
    const cd = checkCooldown(userId, "لعبه", (Math.floor(Math.random() * 6) + 5) * 60000);
    if (!cd.ok) return sendTemp(message.channel, `⏳ انتظر **${formatMs(cd.remaining)}**!`);

    const n       = Math.floor(Math.random() * 10) + 1;
    const correct = n % 2 === 0 ? "زوجي" : "فردي";
    const prize   = Math.floor(Math.random() * 800) + 200;

    const embed = new EmbedBuilder()
      .setTitle("🎮 لعبة البنك")
      .setColor(0x5865f2)
      .setDescription(`<@${userId}> الرقم فردي أو زوجي؟\n💰 الجائزة: **${formatAmount(prize)}**\n⏱️ عندك 20 ثانية!`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`game_odd_${message.channel.id}_${userId}_${correct}_${prize}`).setLabel("فردي 🔢").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`game_even_${message.channel.id}_${userId}_${correct}_${prize}`).setLabel("زوجي 🔢").setStyle(ButtonStyle.Success),
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    setTimeout(async () => {
      await msg.edit({
        embeds: [new EmbedBuilder().setTitle("⏰ انتهى الوقت!").setColor(0xed4245)
          .setDescription(`الجواب كان **${correct}** (الرقم: ${n})`).setTimestamp()],
        components: []
      }).catch(() => {});
    }, 20000);
    return;
  }

  // ══════════════════════════════════════════════
  //  أوامر الملوك
  // ══════════════════════════════════════════════

  // !أبدأ٧٧
  if (args[0] === "!أبدأ٧٧") {
    if (!isKing(userId)) return;
    await message.delete().catch(() => {});
    const askMsg = await message.channel.send({ content: `<@${userId}> منشن رتبة الدعم 👇` });
    const filter = m => m.author.id === userId && m.mentions.roles.size > 0;
    const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });
    collector.on("collect", async m => {
      supportRoleId    = m.mentions.roles.first().id;
      ticketCategoryId = message.channel.parentId;
      await m.delete().catch(() => {});
      await askMsg.delete().catch(() => {});
      const embed = new EmbedBuilder()
        .setTitle("🏦 دعم البنك الفني")
        .setDescription("📌 اضغط الزر أدناه لفتح تذكرة دعم\n⚠️ وضّح مشكلتك بدقة")
        .setColor(0x2b2d31).setFooter({ text: "البنك الرسمي • التذاكر" }).setTimestamp();
      await message.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("open_ticket").setLabel("📩 فتح تذكرة دعم").setStyle(ButtonStyle.Primary)
        )]
      });
    });
    collector.on("end", collected => {
      if (!collected.size) sendTemp(message.channel, "⏰ انتهى الوقت، أعد الأمر.");
    });
    return;
  }

  // -ارسال
  if (args[0] === "-ارسال") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0) return sendTemp(message.channel, "❌ `-ارسال @شخص مبلغ`");
    balances[target.id] = getBalance(target.id) + amount;
    await message.channel.send({
      embeds: [new EmbedBuilder().setTitle("💸 تحويل ناجح").setColor(0x57f287)
        .addFields(
          { name: "المستلم", value: `<@${target.id}>`, inline: true },
          { name: "المبلغ",  value: formatAmount(amount), inline: true },
          { name: "الرصيد الجديد", value: formatAmount(getBalance(target.id)), inline: true }
        ).setTimestamp()]
    });
    await target.send({ embeds: [new EmbedBuilder().setTitle("💰 وصلك تحويل!").setColor(0x57f287)
      .setDescription(`إيداع **${formatAmount(amount)}**\nرصيدك: **${formatAmount(getBalance(target.id))}**`).setTimestamp()] }).catch(() => {});
    return;
  }

  // -سحب
  if (args[0] === "-سحب") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0) return sendTemp(message.channel, "❌ `-سحب @شخص مبلغ`");
    if (getBalance(target.id) < amount) return sendTemp(message.channel, `❌ رصيد <@${target.id}> غير كافٍ`);
    balances[target.id] = getBalance(target.id) - amount;
    await message.channel.send({
      embeds: [new EmbedBuilder().setTitle("🏧 سحب").setColor(0xed4245)
        .addFields(
          { name: "العضو",   value: `<@${target.id}>`, inline: true },
          { name: "المسحوب", value: formatAmount(amount), inline: true },
          { name: "الرصيد الجديد", value: formatAmount(getBalance(target.id)), inline: true }
        ).setTimestamp()]
    });
    return;
  }

  // -رصيد
  if (args[0] === "-رصيد") {
    const target = message.mentions.users.first() || message.author;
    await message.channel.send({
      embeds: [new EmbedBuilder().setTitle("🏦 رصيد الحساب").setColor(0xfee75c)
        .addFields(
          { name: "العضو",  value: `<@${target.id}>`, inline: true },
          { name: "الرصيد", value: formatAmount(getBalance(target.id)), inline: true }
        ).setFooter({ text: "البنك الرسمي" }).setTimestamp()]
    });
    return;
  }

  // -تحويل
  if (args[0] === "-تحويل") {
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0) return sendTemp(message.channel, "❌ `-تحويل @شخص مبلغ`");
    if (target.id === userId) return sendTemp(message.channel, "❌ ما تحول لنفسك");
    if (getBalance(userId) < amount) return sendTemp(message.channel, "❌ رصيدك غير كافٍ");
    balances[userId]    = getBalance(userId) - amount;
    balances[target.id] = getBalance(target.id) + amount;
    await message.channel.send({
      embeds: [new EmbedBuilder().setTitle("💸 تحويل ناجح").setColor(0x57f287)
        .addFields(
          { name: "من",     value: `<@${userId}>`,    inline: true },
          { name: "إلى",    value: `<@${target.id}>`, inline: true },
          { name: "المبلغ", value: formatAmount(amount), inline: true }
        ).setTimestamp()]
    });
    await target.send({ embeds: [new EmbedBuilder().setTitle("💰 وصلك تحويل!").setColor(0x57f287)
      .setDescription(`حوّل لك <@${userId}> **${formatAmount(amount)}**\nرصيدك: **${formatAmount(getBalance(target.id))}**`).setTimestamp()] }).catch(() => {});
    return;
  }

  // !مخزنة
  if (args[0] === "!مخزنة") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0) return sendTemp(message.channel, "❌ `!مخزنة @شخص مبلغ`");
    storage[target.id] = getStorage(target.id) + amount;
    await message.channel.send({
      embeds: [new EmbedBuilder().setTitle("🗄️ تم الحفظ في المخزنة").setColor(0x5865f2)
        .addFields(
          { name: "العضو", value: `<@${target.id}>`, inline: true },
          { name: "المضاف", value: formatAmount(amount), inline: true },
          { name: "إجمالي المخزنة", value: formatAmount(getStorage(target.id)), inline: true }
        ).setTimestamp()]
    });
    return;
  }

  // !جيب
  if (args[0] === "!جيب") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0) return sendTemp(message.channel, "❌ `!جيب @شخص مبلغ`");
    if (getStorage(target.id) < amount)
      return sendTemp(message.channel, `❌ المخزنة ما تكفي!\nالمتوفر: **${formatAmount(getStorage(target.id))}**`);
    storage[target.id]  = getStorage(target.id) - amount;
    balances[target.id] = getBalance(target.id) + amount;
    await message.channel.send({
      embeds: [new EmbedBuilder().setTitle("📦 سحب من المخزنة").setColor(0x57f287)
        .addFields(
          { name: "العضو",  value: `<@${target.id}>`, inline: true },
          { name: "المسحوب", value: formatAmount(amount), inline: true },
          { name: "المخزنة المتبقية", value: formatAmount(getStorage(target.id)), inline: true },
          { name: "الرصيد الجديد", value: formatAmount(getBalance(target.id)), inline: true }
        ).setTimestamp()]
    });
    return;
  }

  // -تعال
  if (args[0] === "-تعال") {
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message.channel, "❌ `-تعال @شخص`");
    await target.send(`👋 طلب منك <@${userId}> في **${message.guild.name}**!\n📍 ${message.channel.url}`)
      .then(() => sendTemp(message.channel, `✅ تم إشعار <@${target.id}>`))
      .catch(() => sendTemp(message.channel, `❌ ما قدرت أوصل لـ <@${target.id}>`));
    return;
  }

  // -صديق
  if (args[0] === "-صديق") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message.channel, "❌ `-صديق @شخص`");
    if (kings.has(target.id)) return sendTemp(message.channel, `ℹ️ <@${target.id}> أصلاً ملك`);
    await message.channel.send({
      content: `<@${userId}> تأكيد منح **<@${target.id}>** صلاحيات الملك؟`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirm_friend_${target.id}`).setLabel("✅ نعم").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("cancel_friend").setLabel("❌ إلغاء").setStyle(ButtonStyle.Danger)
      )]
    });
    return;
  }

  // -اوامر
  if (args[0] === "-اوامر") {
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("📋 أوامر الأعضاء")
        .setColor(0x5865f2)
        .setDescription(
          "**أوامر البنك (في روم البنك):**\n" +
          "`راتب` — راتب 100–1578 ريال\n" +
          "`الوان` — لعبة تخمين الألوان 🎨\n" +
          "`نهب @شخص` — انهب شخص\n" +
          "`ماين` — تعدين\n" +
          "`صاروخ مبلغ` — راهن واضرب\n" +
          "`لعبه` — فردي أو زوجي\n\n" +
          "**أوامر عامة:**\n" +
          "`-رصيد [@شخص]` — اعرض الرصيد\n" +
          "`-تحويل @شخص مبلغ` — حوّل رصيد\n" +
          "`-تعال @شخص` — استدعاء شخص"
        )
        .setFooter({ text: "⚠️ كل أمر ربح له كول‐داون 5–10 دقايق" })
        .setTimestamp()]
    });
    return;
  }

  // !اوامر
  if (args[0] === "!اوامر") {
    if (!isKing(userId)) return;
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("👑 أوامر الملوك")
        .setColor(0xfee75c)
        .setDescription(
          "`!روم` — تخصيص الروم للبنك\n" +
          "`!أبدأ٧٧` — إعداد روم التذاكر\n" +
          "`-ارسال @شخص مبلغ` — إرسال رصيد\n" +
          "`-سحب @شخص مبلغ` — سحب رصيد\n" +
          "`!مخزنة @شخص مبلغ` — حفظ في الخزنة\n" +
          "`!جيب @شخص مبلغ` — سحب من الخزنة\n" +
          "`-صديق @شخص` — منح صلاحيات الملك"
        )
        .setTimestamp()]
    });
    return;
  }
});

// ══════════════════════════════════════════════
//  interactionCreate
// ══════════════════════════════════════════════
client.on("interactionCreate", async (interaction) => {

  // ── زر "اختر القسم" (من !روم embed)
  if (interaction.isButton() && interaction.customId === "show_bank_commands") {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle("📋 أوامر البنك")
        .setColor(0x5865f2)
        .setDescription(
          "`راتب` — احصل على راتبك اليومي\n" +
          "`الوان` — لعبة تخمين الألوان 🎨\n" +
          "`نهب @شخص` — انهب أحد الأعضاء\n" +
          "`ماين` — تعدين واكسب ريالات\n" +
          "`صاروخ مبلغ` — راهن واضرب\n" +
          "`لعبه` — فردي أو زوجي\n" +
          "`-رصيد` — شوف رصيدك\n" +
          "`-تحويل @شخص مبلغ` — حوّل لأحد"
        )
        .setFooter({ text: "⚠️ كل أمر له كول‐داون 5–10 دقايق" })],
      ephemeral: true
    });
    return;
  }

  // ── تأكيد الصديق
  if (interaction.isButton() && interaction.customId.startsWith("confirm_friend_")) {
    if (!isKing(interaction.user.id))
      return interaction.reply({ content: "❌ ليس لديك صلاحية", ephemeral: true });
    const targetId = interaction.customId.replace("confirm_friend_", "");
    kings.add(targetId);
    await interaction.update({ content: `✅ تم منح <@${targetId}> صلاحيات الملك!`, components: [] });
    return;
  }
  if (interaction.isButton() && interaction.customId === "cancel_friend") {
    await interaction.update({ content: "❌ إلغاء", components: [] });
    return;
  }

  // ── لعبة الألوان — الأزرار (cg_ = color guess)
  if (interaction.isButton() && interaction.customId.startsWith("cg_")) {
    const parts     = interaction.customId.split("_");
    const channelId = parts[1];
    const chosen    = parts[2]; // اللون المختار
    const session   = colorSessions[channelId];

    if (!session) return interaction.reply({ content: "❌ اللعبة انتهت", ephemeral: true });
    if (interaction.user.id !== session.userId)
      return interaction.reply({ content: "❌ مو لعبتك!", ephemeral: true });

    session.attempts++;

    const boardStr = boardToString(session.board);

    if (chosen === session.target) {
      // ✅ أصاب اللون الصح
      delete colorSessions[channelId];
      balances[session.userId] = getBalance(session.userId) + session.prize;
      const timeTaken = Math.floor((Date.now() - session.startTime) / 1000);

      await interaction.update({
        content: null,
        embeds: [new EmbedBuilder()
          .setTitle("🎨 صح! ربحت! 🎉")
          .setColor(0x57f287)
          .setDescription(
            boardStr + "\n\n" +
            `<@${session.userId}> اخترت ${COLORS[session.target]} ✅\n` +
            `عدد خانات ${COLORS[session.target]}: **${session.correct}**\n` +
            `💰 ربحت **${formatAmount(session.prize)}**\n` +
            `🏦 رصيدك: **${formatAmount(getBalance(session.userId))}**\n` +
            `⏱️ في ${timeTaken} ثانية | المحاولات: ${session.attempts}/${session.maxAttempts}`
          )
          .setTimestamp()],
        components: []
      });

    } else if (session.attempts >= session.maxAttempts) {
      // ❌ نفدت المحاولات
      delete colorSessions[channelId];
      await interaction.update({
        content: null,
        embeds: [new EmbedBuilder()
          .setTitle("❌ خسرت! نفدت المحاولات")
          .setColor(0xed4245)
          .setDescription(
            boardStr + "\n\n" +
            `اللون الصح كان ${COLORS[session.target]} (${session.correct} خانة)`
          )
          .setTimestamp()],
        components: []
      });

    } else {
      // ❌ غلط لكن في محاولات باقية
      const boardEmbed = new EmbedBuilder()
        .setTitle("الوان")
        .setColor(0x2b2d31)
        .setDescription(boardStr)
        .addFields(
          { name: "عدد المحاولات :", value: `${session.attempts}/${session.maxAttempts}`, inline: true },
          { name: "⏰ الوقت :", value: "2 دقائق", inline: true }
        )
        .setFooter({ text: `❌ ${COLORS[chosen]} غلط! الجائزة: ${formatAmount(session.prize)}` })
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cg_${channelId}_purple`).setLabel("🟪").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`cg_${channelId}_yellow`).setLabel("🟨").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`cg_${channelId}_brown`).setLabel("🟫").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`cg_${channelId}_blue`).setLabel("🟦").setStyle(ButtonStyle.Secondary),
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cg_${channelId}_red`).setLabel("🟥").setStyle(ButtonStyle.Danger),
      );

      await interaction.update({
        content: `<@${session.userId}> — **كم عدد ${COLORS[session.target]} في اللوحة؟**`,
        embeds: [boardEmbed],
        components: [row1, row2]
      });
    }
    return;
  }

  // ── لعبه فردي/زوجي
  if (interaction.isButton() && (interaction.customId.startsWith("game_odd_") || interaction.customId.startsWith("game_even_"))) {
    const parts   = interaction.customId.split("_");
    const guess   = parts[1] === "odd" ? "فردي" : "زوجي";
    const ownerId = parts[3];
    const correct = parts[4];
    const prize   = parseInt(parts[5]);

    if (interaction.user.id !== ownerId)
      return interaction.reply({ content: "❌ مو لعبتك!", ephemeral: true });

    if (guess === correct) {
      balances[ownerId] = getBalance(ownerId) + prize;
      await interaction.update({
        embeds: [new EmbedBuilder().setTitle("🎉 صح! ربحت!").setColor(0x57f287)
          .setDescription(`<@${ownerId}> اخترت **${guess}** وكان صح!\n💰 ربحت **${formatAmount(prize)}**\n🏦 رصيدك: **${formatAmount(getBalance(ownerId))}**`)
          .setTimestamp()],
        components: []
      });
    } else {
      const loss = Math.floor(prize * 0.5);
      balances[ownerId] = Math.max(0, getBalance(ownerId) - loss);
      await interaction.update({
        embeds: [new EmbedBuilder().setTitle("❌ غلط! خسرت!").setColor(0xed4245)
          .setDescription(`<@${ownerId}> اخترت **${guess}** لكن الجواب **${correct}**!\nخسرت **${formatAmount(loss)}**\n🏦 رصيدك: **${formatAmount(getBalance(ownerId))}**`)
          .setTimestamp()],
        components: []
      });
    }
    return;
  }

  // ── فتح التذكرة
  if (interaction.isButton() && interaction.customId === "open_ticket") {
    const modal = new ModalBuilder().setCustomId("ticket_modal").setTitle("فتح تذكرة دعم");
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("ticket_reason").setLabel("سبب فتحك للتذكرة")
        .setStyle(TextInputStyle.Paragraph).setPlaceholder("اشرح مشكلتك...").setRequired(true).setMinLength(10).setMaxLength(1000)
    ));
    await interaction.showModal(modal);
    return;
  }

  // ── استلام المودال وإنشاء التذكرة
  if (interaction.isModalSubmit() && interaction.customId === "ticket_modal") {
    const reason = interaction.fields.getTextInputValue("ticket_reason");
    const user   = interaction.user;
    const guild  = interaction.guild;
    ticketCounter++;
    const ticketNum   = String(ticketCounter).padStart(4, "0");
    const channelName = `Ticket-${ticketNum}-${user.username}`.slice(0, 100);

    const perms = [
      { id: guild.id,       deny:  [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id,        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory] },
    ];
    if (supportRoleId) perms.push({
      id: supportRoleId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages]
    });

    let ticketChannel;
    try {
      ticketChannel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: ticketCategoryId || null, permissionOverwrites: perms });
    } catch {
      return interaction.reply({ content: "❌ فشل إنشاء التذكرة، تأكد من صلاحيات البوت", ephemeral: true });
    }

    const ticketRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ping_owner_${ticketChannel.id}`).setLabel("📢 منشن الأونر").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ping_support_${ticketChannel.id}`).setLabel("🔔 منشن الدعم").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`claim_ticket_${ticketChannel.id}`).setLabel("✋ استلام").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`delete_ticket_${ticketChannel.id}`).setLabel("🗑️ حذف").setStyle(ButtonStyle.Secondary)
    );

    await ticketChannel.send({
      content: `${supportRoleId ? `<@&${supportRoleId}>` : ""} <@${user.id}>`,
      embeds: [new EmbedBuilder().setTitle(`📋 تذكرة #${ticketNum}`).setColor(0x5865f2)
        .setDescription(`مرحباً <@${user.id}>!\n\n**السبب:**\n${reason}`)
        .addFields({ name: "الحالة", value: "🟡 قيد الانتظار", inline: true })
        .setFooter({ text: `#${ticketNum}` }).setTimestamp()],
      components: [ticketRow]
    });
    await interaction.reply({ content: `✅ تذكرتك في ${ticketChannel}`, ephemeral: true });
    return;
  }

  // ── أزرار التذكرة
  if (interaction.isButton() && interaction.customId.startsWith("ping_support_")) {
    if (!supportRoleId) return interaction.reply({ content: "❌ رتبة الدعم غير محددة", ephemeral: true });
    const key = `pinged_${interaction.channel.id}_${interaction.user.id}`;
    if (!isKing(interaction.user.id) && !hasRole(interaction, supportRoleId)) {
      if (global[key]) return interaction.reply({ content: "❌ مرة واحدة فقط", ephemeral: true });
      global[key] = true;
    }
    await interaction.reply({ content: `<@&${supportRoleId}>` });
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith("ping_owner_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
      return interaction.reply({ content: "❌ للدعم فقط", ephemeral: true });
    await interaction.reply({ content: `${[...kings].map(id => `<@${id}>`).join(" ")} 📢` });
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith("claim_ticket_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
      return interaction.reply({ content: "❌ للدعم فقط", ephemeral: true });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ استلم <@${interaction.user.id}>`)] });
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith("delete_ticket_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
      return interaction.reply({ content: "❌ للدعم فقط", ephemeral: true });
    await interaction.reply({ content: "🗑️ حذف خلال 5 ثوانٍ..." });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }
});

// ══════════════════════════════════════════════
//  HTTP Server (لـ Render)
// ══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end("Bot is running!"); })
  .listen(PORT, () => console.log(`🌐 HTTP on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
