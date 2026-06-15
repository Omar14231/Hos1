const {
  Client, GatewayIntentBits, Partials,
  PermissionsBitField, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType,
} = require("discord.js");
const http = require("http");

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
  str = String(str)
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/,/g, "")
    .trim()
    .toLowerCase();
  if (str.endsWith("k")) return parseFloat(str) * 1000;
  if (str.endsWith("m")) return parseFloat(str) * 1000000;
  return parseFloat(str);
}

function formatAmount(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M ريال";
  if (num >= 1000)    return (num / 1000).toFixed(1)    + "k ريال";
  return num.toLocaleString("ar-SA") + " ريال";
}

function formatMs(ms) {
  const mins = Math.ceil(ms / 60000);
  const secs = Math.ceil((ms % 60000) / 1000);
  if (mins > 0) return `${mins} دقيقة`;
  return `${secs} ثانية`;
}

async function sendTemp(channel, text, delay = 7000) {
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

function cdTime() {
  return (Math.floor(Math.random() * 6) + 5) * 60000;
}

// ══════════════════════════════════════════════
//  لعبة الألوان
// ══════════════════════════════════════════════
const COLORS = {
  yellow: "🟨",
  purple: "🟪",
  brown:  "🟫",
  blue:   "🟦",
  red:    "🟥",
};
const COLOR_LIST = ["yellow", "purple", "brown", "blue", "red"];

function generateColorBoard() {
  const board = [];
  for (let r = 0; r < 10; r++) {
    const row = [];
    for (let c = 0; c < 10; c++) {
      if (Math.random() < 0.55) {
        row.push("yellow");
      } else {
        const others = COLOR_LIST.filter(x => x !== "yellow");
        row.push(others[Math.floor(Math.random() * others.length)]);
      }
    }
    board.push(row);
  }
  return board;
}

function boardToString(board) {
  return board.map(row => row.map(c => COLORS[c]).join("")).join("\n");
}

function countColor(board, color) {
  return board.flat().filter(c => c === color).length;
}

const colorSessions = {};

// ══════════════════════════════════════════════
//  سلوت
// ══════════════════════════════════════════════
const SLOT_SYMBOLS = ["🍒", "🍋", "🍇", "⭐", "💎", "7️⃣", "🔔", "🍀"];

function spinSlot() {
  return Array.from({ length: 3 }, () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
}

function calcSlotMultiplier(reels) {
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    if (reels[0] === "💎") return 10;
    if (reels[0] === "7️⃣") return 7;
    if (reels[0] === "⭐") return 5;
    return 3;
  }
  if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) return 1.5;
  return 0;
}

// ══════════════════════════════════════════════
//  نرد
// ══════════════════════════════════════════════
const DICE_EMOJIS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// ══════════════════════════════════════════════
//  الكراش
// ══════════════════════════════════════════════
const crashSessions = {};

// ══════════════════════════════════════════════
//  اكس-او
// ══════════════════════════════════════════════
const tttSessions = {};

function createTTTBoard() {
  return Array(9).fill(null);
}

function checkTTTWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function renderTTTBoard(board) {
  const sym = (v) => v === "X" ? "❌" : v === "O" ? "⭕" : "⬜";
  return [
    [0,1,2],[3,4,5],[6,7,8]
  ].map(row => row.map(i => sym(board[i])).join("")).join("\n");
}

function buildTTTComponents(board, channelId, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const sym = board[i];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${channelId}_${i}`)
          .setLabel(sym === "X" ? "❌" : sym === "O" ? "⭕" : "·")
          .setStyle(sym === "X" ? ButtonStyle.Danger : sym === "O" ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(disabled || !!sym)
      );
    }
    rows.push(row);
  }
  return rows;
}

// ══════════════════════════════════════════════
//  مباريات (تحدي)
// ══════════════════════════════════════════════
const challengeSessions = {};

// ══════════════════════════════════════════════
//  READY
// ══════════════════════════════════════════════
client.once("clientReady", () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
  client.user.setActivity("🏦 البنك الرسمي", { type: 0 });
});

// ══════════════════════════════════════════════
//  messageCreate
// ══════════════════════════════════════════════
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content.trim();
  const args    = content.split(/\s+/);
  const cmd     = args[0];
  const userId  = message.author.id;
  const member  = message.member;

  // ══════════════════════
  //  !روم — للملوك
  // ══════════════════════
  if (cmd === "!روم") {
    if (!isKing(userId)) return;
    bankChannelId = message.channel.id;
    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle("🏦 البنك الرسمي")
      .setColor(0x5865f2)
      .setDescription(
        "**╔══════════════════════╗**\n" +
        "**║   مرحباً بك في البنك!   ║**\n" +
        "**╚══════════════════════╝**\n\n" +
        "💰 **ألعاب الربح:**\n" +
        "```\n" +
        "راتب     • ماين     • صاروخ\n" +
        "سلوت     • كراش    • نرد\n" +
        "```\n" +
        "🎮 **ألعاب تفاعلية:**\n" +
        "```\n" +
        "الوان    • لعبه    • اكس-او\n" +
        "```\n" +
        "💸 **التحويلات:**\n" +
        "```\n" +
        "-تحويل @شخص مبلغ\n" +
        "-رصيد [@شخص]\n" +
        "```"
      )
      .setImage("https://i.imgur.com/HU7m0ck.gif")
      .setFooter({ text: "🏦 البنك الرسمي • حظ سعيد 🍀" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("show_bank_commands")
        .setLabel("📋 عرض كل الأوامر")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("bank_leaderboard")
        .setLabel("🏆 المتصدرين")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("bank_my_balance")
        .setLabel("💰 رصيدي")
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  // ── أوامر البنك تعمل فقط في روم البنك
  const bankCmds = ["راتب", "الوان", "نهب", "لعبه", "ماين", "صاروخ", "سلوت", "كراش", "نرد", "اكس-او"];
  if (bankCmds.includes(cmd) && bankChannelId && message.channel.id !== bankChannelId) {
    return sendTemp(message.channel, `❌ | استخدم أوامر البنك في <#${bankChannelId}> فقط!`);
  }

  // ══════════════════════
  //  راتب
  // ══════════════════════
  if (cmd === "راتب") {
    const cd = checkCooldown(userId, "راتب", cdTime());
    if (!cd.ok) {
      return sendTemp(message.channel, `⏳ | <@${userId}> انتظر **${formatMs(cd.remaining)}** للراتب التالي!`);
    }

    const amount = Math.floor(Math.random() * (2500 - 100 + 1)) + 100;
    balances[userId] = getBalance(userId) + amount;

    const titles = ["💵 راتبك وصل!", "💰 دفعة راتب!", "🏦 تم الإيداع!"];
    const colors = [0x57f287, 0x5865f2, 0xfee75c];
    const idx = Math.floor(Math.random() * titles.length);

    const embed = new EmbedBuilder()
      .setTitle(titles[idx])
      .setColor(colors[idx])
      .setDescription(
        `> 👤 **العضو:** <@${userId}>\n` +
        `> 💵 **الراتب:** \`${formatAmount(amount)}\`\n` +
        `> 🏦 **رصيدك الكلي:** \`${formatAmount(getBalance(userId))}\``
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `البنك الرسمي • ${new Date().toLocaleString("ar-SA")}` })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ══════════════════════
  //  الوان
  // ══════════════════════
  if (cmd === "الوان") {
    if (colorSessions[message.channel.id]) {
      return sendTemp(message.channel, "❌ | في لعبة ألوان شغالة الحين، انتظر!");
    }

    const cd = checkCooldown(userId, "الوان", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | <@${userId}> انتظر **${formatMs(cd.remaining)}**!`);

    const board       = generateColorBoard();
    const maxAttempts = 3;
    const prize       = Math.floor(Math.random() * 2500) + 500;
    const targetColor = COLOR_LIST[Math.floor(Math.random() * COLOR_LIST.length)];
    const correctCount = countColor(board, targetColor);
    const boardStr    = boardToString(board);

    const colorStats = COLOR_LIST.map(c => `${COLORS[c]} ×??`).join("  ");

    const embed = new EmbedBuilder()
      .setTitle("🎨 لعبة الألوان")
      .setColor(0x5865f2)
      .setDescription(
        "```\n" + boardStr + "\n```\n\n" +
        `🎯 **السؤال:** كم مرة يظهر ${COLORS[targetColor]} في اللوحة؟\n` +
        `💰 **الجائزة:** \`${formatAmount(prize)}\`\n` +
        `🔢 **المحاولات:** 0/${maxAttempts} | ⏰ **الوقت:** دقيقتان`
      )
      .setFooter({ text: `لعبة ${message.author.username} • اختر اللون الصحيح!` })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_purple`).setLabel("🟪 بنفسجي").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_yellow`).setLabel("🟨 أصفر").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_brown`).setLabel("🟫 بني").setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_blue`).setLabel("🟦 أزرق").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cg_${message.channel.id}_red`).setLabel("🟥 أحمر").setStyle(ButtonStyle.Danger),
    );

    const msg = await message.channel.send({
      content: `🎮 | <@${userId}> — **كم مرة يظهر ${COLORS[targetColor]} في اللوحة؟**`,
      embeds: [embed],
      components: [row1, row2]
    });

    colorSessions[message.channel.id] = {
      board, userId, attempts: 0, maxAttempts,
      target: targetColor, correct: correctCount,
      prize, startTime: Date.now(), msgId: msg.id,
    };

    setTimeout(async () => {
      const sess = colorSessions[message.channel.id];
      if (!sess || sess.msgId !== msg.id) return;
      delete colorSessions[message.channel.id];
      await msg.edit({
        content: null,
        embeds: [new EmbedBuilder()
          .setTitle("⏰ انتهى الوقت!")
          .setColor(0xed4245)
          .setDescription(
            `> ❌ **انتهى الوقت!**\n` +
            `> الجواب كان **${correctCount}** خانة ${COLORS[targetColor]}\n` +
            `> <@${userId}> حظ أحسن المرة الجاية!`
          )
          .setTimestamp()],
        components: []
      }).catch(() => {});
    }, 2 * 60 * 1000);
    return;
  }

  // ══════════════════════
  //  نهب
  // ══════════════════════
  if (cmd === "نهب") {
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message.channel, "❌ | الاستخدام: `نهب @شخص`");
    if (target.id === userId) return sendTemp(message.channel, "❌ | ما تنهب نفسك!");
    if (target.bot) return sendTemp(message.channel, "❌ | ما تنهب البوتات!");
    if (getBalance(target.id) <= 0) return sendTemp(message.channel, `❌ | <@${target.id}> ما عنده رصيد يُنهب!`);

    const cd = checkCooldown(userId, "نهب", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | انتظر **${formatMs(cd.remaining)}** قبل النهب!`);

    const success = Math.random() > 0.45;
    if (success) {
      const pct    = Math.random() * 0.3 + 0.1;
      const stolen = Math.floor(getBalance(target.id) * pct);
      balances[userId]    = getBalance(userId) + stolen;
      balances[target.id] = getBalance(target.id) - stolen;

      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle("⚔️ نهب ناجح! 🎉")
          .setColor(0xff9d00)
          .setDescription(
            `> 🦹 **الناهب:** <@${userId}>\n` +
            `> 😱 **الضحية:** <@${target.id}>\n` +
            `> 💰 **المنهوب:** \`${formatAmount(stolen)}\`\n` +
            `> 📊 **نسبة النهب:** \`${(pct * 100).toFixed(0)}%\``
          )
          .addFields(
            { name: "🏦 رصيدك الجديد", value: `\`${formatAmount(getBalance(userId))}\``, inline: true },
            { name: "😢 رصيد الضحية", value: `\`${formatAmount(getBalance(target.id))}\``, inline: true }
          )
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp()]
      });
    } else {
      const fine = Math.floor(getBalance(userId) * 0.1);
      balances[userId] = Math.max(0, getBalance(userId) - fine);
      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle("⚔️ النهب فشل! 🚔")
          .setColor(0xed4245)
          .setDescription(
            `> 🚔 **<@${userId}> انكشف!**\n` +
            `> 💸 **الغرامة:** \`${formatAmount(fine)}\`\n` +
            `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
          )
          .setTimestamp()]
      });
    }
    return;
  }

  // ══════════════════════
  //  ماين
  // ══════════════════════
  if (cmd === "ماين") {
    const cd = checkCooldown(userId, "ماين", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | انتظر **${formatMs(cd.remaining)}** للتعدين!`);

    const roll = Math.random();
    let embed;

    if (roll > 0.65) {
      // فوز كبير
      const amount = Math.floor(Math.random() * 1500) + 500;
      balances[userId] = getBalance(userId) + amount;
      embed = new EmbedBuilder()
        .setTitle("⛏️ 💎 كنز ضخم!")
        .setColor(0xfee75c)
        .setDescription(
          `> ⛏️ **<@${userId}> حفر ولقى كنز ذهبي!**\n` +
          `> 💎 **الربح:** \`${formatAmount(amount)}\`\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
        );
    } else if (roll > 0.3) {
      // فوز عادي
      const amount = Math.floor(Math.random() * 499) + 100;
      balances[userId] = getBalance(userId) + amount;
      embed = new EmbedBuilder()
        .setTitle("⛏️ تعدين ناجح!")
        .setColor(0x57f287)
        .setDescription(
          `> ⛏️ **<@${userId}> حفر ولقى معدن!**\n` +
          `> 💰 **الربح:** \`${formatAmount(amount)}\`\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
        );
    } else {
      // خسارة
      const loss = Math.min(Math.floor(Math.random() * 400) + 50, getBalance(userId));
      balances[userId] = Math.max(0, getBalance(userId) - loss);
      embed = new EmbedBuilder()
        .setTitle("⛏️ 💥 الحفرة انهارت!")
        .setColor(0xed4245)
        .setDescription(
          `> 💥 **<@${userId}> انهارت الحفرة عليه!**\n` +
          `> 💸 **الخسارة:** \`${formatAmount(loss)}\`\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
        );
    }

    embed.setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ══════════════════════
  //  صاروخ
  // ══════════════════════
  if (cmd === "صاروخ") {
    const bet = parseAmount(args[1]);
    if (isNaN(bet) || bet <= 0) return sendTemp(message.channel, "❌ | الاستخدام: `صاروخ المبلغ`");
    if (getBalance(userId) < bet) return sendTemp(message.channel, `❌ | رصيدك \`${formatAmount(getBalance(userId))}\` غير كافٍ!`);

    const cd = checkCooldown(userId, "صاروخ", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | انتظر **${formatMs(cd.remaining)}**!`);

    const mults = [0, 0, 0.5, 1.5, 2, 2.5, 3, 4, 5];
    const mult  = mults[Math.floor(Math.random() * mults.length)];
    const gain  = Math.floor(bet * mult);
    balances[userId] = getBalance(userId) - bet + gain;

    const stages = mult === 0 ? "💥 انفجر على الفور!" :
                   mult < 1   ? "📉 هبط مبكراً..." :
                   mult >= 4  ? "🌌 وصل الفضاء الخارجي! 🚀✨" :
                   mult >= 3  ? "🌟 وصل الفضاء!" :
                   "🚀 طار بسرعة!";

    const color = mult === 0 ? 0xed4245 : mult < 1 ? 0xff9d00 : mult >= 3 ? 0x57f287 : 0x5865f2;

    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle(`🚀 الصاروخ — ${stages}`)
        .setColor(color)
        .setDescription(
          `> 💵 **الرهان:** \`${formatAmount(bet)}\`\n` +
          `> 📈 **المضاعف:** \`${mult}x\`\n` +
          `> ${mult >= 1 ? "💰 **الربح:**" : "💸 **الخسارة:**"} \`${formatAmount(Math.abs(gain - bet))}\`\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setTimestamp()]
    });
    return;
  }

  // ══════════════════════
  //  لعبه — فردي/زوجي
  // ══════════════════════
  if (cmd === "لعبه") {
    const cd = checkCooldown(userId, "لعبه", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | انتظر **${formatMs(cd.remaining)}**!`);

    const n       = Math.floor(Math.random() * 10) + 1;
    const correct = n % 2 === 0 ? "زوجي" : "فردي";
    const prize   = Math.floor(Math.random() * 1500) + 300;

    const embed = new EmbedBuilder()
      .setTitle("🎮 لعبة فردي / زوجي")
      .setColor(0x5865f2)
      .setDescription(
        `> <@${userId}> **الرقم المخفي فردي أم زوجي؟**\n` +
        `> 💰 **الجائزة:** \`${formatAmount(prize)}\`\n` +
        `> ⏱️ **عندك 20 ثانية للإجابة!**\n\n` +
        `> 🔢 **تلميح:** الرقم بين 1 و 10`
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_odd_${message.channel.id}_${userId}_${correct}_${prize}`)
        .setLabel("🔢 فردي")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`game_even_${message.channel.id}_${userId}_${correct}_${prize}`)
        .setLabel("🔢 زوجي")
        .setStyle(ButtonStyle.Success),
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    setTimeout(async () => {
      await msg.edit({
        embeds: [new EmbedBuilder()
          .setTitle("⏰ انتهى الوقت!")
          .setColor(0xed4245)
          .setDescription(
            `> ⏰ **<@${userId}> ما رد في الوقت!**\n` +
            `> الجواب كان **${correct}** (الرقم: **${n}**)\n` +
            `> 🎰 الجائزة ضاعت: \`${formatAmount(prize)}\``
          )
          .setTimestamp()],
        components: []
      }).catch(() => {});
    }, 20000);
    return;
  }

  // ══════════════════════
  //  سلوت
  // ══════════════════════
  if (cmd === "سلوت") {
    const bet = parseAmount(args[1]);
    if (isNaN(bet) || bet <= 0) return sendTemp(message.channel, "❌ | الاستخدام: `سلوت المبلغ`");
    if (getBalance(userId) < bet) return sendTemp(message.channel, `❌ | رصيدك \`${formatAmount(getBalance(userId))}\` غير كافٍ!`);

    const cd = checkCooldown(userId, "سلوت", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | انتظر **${formatMs(cd.remaining)}**!`);

    const reels = spinSlot();
    const mult  = calcSlotMultiplier(reels);
    const gain  = Math.floor(bet * mult);
    balances[userId] = getBalance(userId) - bet + gain;

    const display = `╔══════════════╗\n║  ${reels.join("  │  ")}  ║\n╚══════════════╝`;
    const won = mult > 0;

    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle(mult >= 5 ? "🎰 🎉 JACKPOT! 🎉" : won ? "🎰 ربحت!" : "🎰 ما حالفك الحظ!")
        .setColor(mult >= 5 ? 0xfee75c : won ? 0x57f287 : 0xed4245)
        .setDescription(
          `\`\`\`\n${display}\n\`\`\`\n` +
          `> 💵 **الرهان:** \`${formatAmount(bet)}\`\n` +
          `> 📈 **المضاعف:** \`${mult}x\`\n` +
          `> ${won ? "💰 **الربح:**" : "💸 **الخسارة:**"} \`${formatAmount(Math.abs(gain - bet))}\`\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: "💎×3=10x | 7️⃣×3=7x | ⭐×3=5x | أي×3=3x | جزئي=1.5x" })
        .setTimestamp()]
    });
    return;
  }

  // ══════════════════════
  //  كراش
  // ══════════════════════
  if (cmd === "كراش") {
    const bet = parseAmount(args[1]);
    if (isNaN(bet) || bet <= 0) return sendTemp(message.channel, "❌ | الاستخدام: `كراش المبلغ`");
    if (getBalance(userId) < bet) return sendTemp(message.channel, `❌ | رصيدك \`${formatAmount(getBalance(userId))}\` غير كافٍ!`);

    if (crashSessions[userId]) return sendTemp(message.channel, "❌ | عندك كراش شغال الحين!");

    const cd = checkCooldown(userId, "كراش", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | انتظر **${formatMs(cd.remaining)}**!`);

    balances[userId] = getBalance(userId) - bet;

    // الكراش يحدث عند مضاعف عشوائي
    const crashAt = parseFloat((1 + Math.random() * 9).toFixed(2));
    let current   = 1.00;

    crashSessions[userId] = { bet, crashAt, current, cashed: false };

    const buildEmbed = (mult, crashed = false, cashedOut = false) => {
      const bar = crashed ? "💥 CRASHED!" : cashedOut ? "✅ CASHED OUT!" : "🚀".repeat(Math.min(Math.floor(mult), 10));
      return new EmbedBuilder()
        .setTitle("🚀 كراش")
        .setColor(crashed ? 0xed4245 : cashedOut ? 0x57f287 : 0x5865f2)
        .setDescription(
          `\`\`\`\n${bar}\n\`\`\`\n` +
          `> 📈 **المضاعف الحالي:** \`${mult.toFixed(2)}x\`\n` +
          `> 💵 **رهانك:** \`${formatAmount(bet)}\`\n` +
          `> 💰 **لو نزلت الحين:** \`${formatAmount(Math.floor(bet * mult))}\`\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
        )
        .setTimestamp();
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash_cashout_${userId}`)
        .setLabel("💰 سحب!")
        .setStyle(ButtonStyle.Success)
    );

    const msg = await message.channel.send({
      content: `<@${userId}> 🚀 الكراش بدأ!`,
      embeds: [buildEmbed(1.00)],
      components: [row]
    });

    const interval = setInterval(async () => {
      const sess = crashSessions[userId];
      if (!sess) { clearInterval(interval); return; }
      if (sess.cashed) { clearInterval(interval); return; }

      current = parseFloat((current + 0.15 + Math.random() * 0.1).toFixed(2));
      sess.current = current;

      if (current >= crashAt) {
        clearInterval(interval);
        delete crashSessions[userId];
        await msg.edit({
          content: `💥 | <@${userId}> انفجر الكراش عند **${crashAt}x**!`,
          embeds: [buildEmbed(crashAt, true)],
          components: []
        }).catch(() => {});
        return;
      }

      await msg.edit({ embeds: [buildEmbed(current)], components: [row] }).catch(() => {});
    }, 2000);

    // إيقاف تلقائي بعد 30 ثانية
    setTimeout(() => {
      if (crashSessions[userId]) {
        clearInterval(interval);
        delete crashSessions[userId];
        msg.edit({
          content: `💥 | <@${userId}> انفجر الكراش!`,
          embeds: [buildEmbed(crashAt, true)],
          components: []
        }).catch(() => {});
      }
    }, 30000);
    return;
  }

  // ══════════════════════
  //  نرد
  // ══════════════════════
  if (cmd === "نرد") {
    const bet = parseAmount(args[1]);
    if (isNaN(bet) || bet <= 0) return sendTemp(message.channel, "❌ | الاستخدام: `نرد المبلغ`");
    if (getBalance(userId) < bet) return sendTemp(message.channel, `❌ | رصيدك \`${formatAmount(getBalance(userId))}\` غير كافٍ!`);

    const cd = checkCooldown(userId, "نرد", cdTime());
    if (!cd.ok) return sendTemp(message.channel, `⏳ | انتظر **${formatMs(cd.remaining)}**!`);

    const playerDice = Math.floor(Math.random() * 6) + 1;
    const botDice    = Math.floor(Math.random() * 6) + 1;
    const playerEmoji = DICE_EMOJIS[playerDice - 1];
    const botEmoji    = DICE_EMOJIS[botDice - 1];

    let result, color;
    if (playerDice > botDice) {
      balances[userId] = getBalance(userId) - bet + Math.floor(bet * 2);
      result = `🎉 **فزت!** ربحت \`${formatAmount(bet)}\``;
      color  = 0x57f287;
    } else if (playerDice < botDice) {
      balances[userId] = getBalance(userId) - bet;
      result = `😢 **خسرت!** خسرت \`${formatAmount(bet)}\``;
      color  = 0xed4245;
    } else {
      result = `🤝 **تعادل!** رجع رهانك`;
      color  = 0xfee75c;
    }

    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🎲 لعبة النرد")
        .setColor(color)
        .setDescription(
          `> 👤 **أنت:** ${playerEmoji} (${playerDice})\n` +
          `> 🤖 **البوت:** ${botEmoji} (${botDice})\n\n` +
          `> ${result}\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(userId))}\``
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setTimestamp()]
    });
    return;
  }

  // ══════════════════════
  //  اكس-او
  // ══════════════════════
  if (cmd === "اكس-او") {
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message.channel, "❌ | الاستخدام: `اكس-او @شخص`");
    if (target.id === userId) return sendTemp(message.channel, "❌ | ما تلعب مع نفسك!");
    if (target.bot) return sendTemp(message.channel, "❌ | ما تلعب مع البوت!");

    const bet = parseAmount(args[2]);
    if (isNaN(bet) || bet <= 0) return sendTemp(message.channel, "❌ | الاستخدام: `اكس-او @شخص المبلغ`");
    if (getBalance(userId) < bet) return sendTemp(message.channel, "❌ | رصيدك غير كافٍ!");

    // دعوة المنافس
    const inviteRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ttt_accept_${userId}_${target.id}_${bet}`)
        .setLabel("✅ قبول التحدي")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ttt_decline_${userId}_${target.id}`)
        .setLabel("❌ رفض")
        .setStyle(ButtonStyle.Danger)
    );

    const inviteEmbed = new EmbedBuilder()
      .setTitle("❌⭕ تحدي اكس-او!")
      .setColor(0x5865f2)
      .setDescription(
        `> 🎮 **<@${userId}> يتحداك على اكس-او!**\n` +
        `> 💰 **الرهان:** \`${formatAmount(bet)}\`\n` +
        `> ⏱️ **عندك 30 ثانية للقبول**`
      )
      .setTimestamp();

    const invMsg = await message.channel.send({
      content: `<@${target.id}> لديك تحدي!`,
      embeds: [inviteEmbed],
      components: [inviteRow]
    });

    setTimeout(() => {
      invMsg.edit({ components: [] }).catch(() => {});
    }, 30000);
    return;
  }

  // ══════════════════════════════════════════════
  //  أوامر الملوك
  // ══════════════════════════════════════════════

  // !أبدأ٧٧
  if (cmd === "!أبدأ٧٧") {
    if (!isKing(userId)) return;
    await message.delete().catch(() => {});
    const askMsg = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("⚙️ إعداد روم التذاكر")
        .setColor(0x5865f2)
        .setDescription(`<@${userId}> منشن رتبة الدعم 👇`)
        .setTimestamp()]
    });

    const filter = m => m.author.id === userId && m.mentions.roles.size > 0;
    const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });
    collector.on("collect", async m => {
      supportRoleId    = m.mentions.roles.first().id;
      ticketCategoryId = message.channel.parentId;
      await m.delete().catch(() => {});
      await askMsg.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle("🎫 دعم البنك الفني")
        .setColor(0x2b2d31)
        .setDescription(
          "**مرحباً بك في دعم البنك! 👋**\n\n" +
          "> 📌 اضغط الزر أدناه لفتح تذكرة دعم\n" +
          "> ⚠️ وضّح مشكلتك بدقة لنساعدك بسرعة\n" +
          "> ⏰ سيتم الرد خلال أقل وقت ممكن"
        )
        .setFooter({ text: "البنك الرسمي • التذاكر" })
        .setTimestamp();

      await message.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("open_ticket")
            .setLabel("📩 فتح تذكرة دعم")
            .setStyle(ButtonStyle.Primary)
        )]
      });
    });
    collector.on("end", collected => {
      if (!collected.size) sendTemp(message.channel, "⏰ انتهى الوقت، أعد الأمر.");
    });
    return;
  }

  // -ارسال
  if (cmd === "-ارسال") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message.channel, "❌ | الاستخدام: `-ارسال @شخص مبلغ`");

    balances[target.id] = getBalance(target.id) + amount;
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("💸 تحويل ملكي ناجح")
        .setColor(0x57f287)
        .setDescription(
          `> 👑 **من:** <@${userId}>\n` +
          `> 👤 **إلى:** <@${target.id}>\n` +
          `> 💰 **المبلغ:** \`${formatAmount(amount)}\`\n` +
          `> 🏦 **رصيده الجديد:** \`${formatAmount(getBalance(target.id))}\``
        )
        .setTimestamp()]
    });
    await target.send({
      embeds: [new EmbedBuilder()
        .setTitle("💰 وصلك إيداع!")
        .setColor(0x57f287)
        .setDescription(
          `> 💵 **تم إيداع:** \`${formatAmount(amount)}\`\n` +
          `> 🏦 **رصيدك الجديد:** \`${formatAmount(getBalance(target.id))}\``
        )
        .setTimestamp()]
    }).catch(() => {});
    return;
  }

  // -سحب
  if (cmd === "-سحب") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message.channel, "❌ | الاستخدام: `-سحب @شخص مبلغ`");
    if (getBalance(target.id) < amount)
      return sendTemp(message.channel, `❌ | رصيد <@${target.id}> غير كافٍ! (${formatAmount(getBalance(target.id))})`);

    balances[target.id] = getBalance(target.id) - amount;
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🏧 سحب ملكي")
        .setColor(0xed4245)
        .setDescription(
          `> 👤 **العضو:** <@${target.id}>\n` +
          `> 💸 **المسحوب:** \`${formatAmount(amount)}\`\n` +
          `> 🏦 **رصيده الجديد:** \`${formatAmount(getBalance(target.id))}\``
        )
        .setTimestamp()]
    });
    return;
  }

  // -رصيد
  if (cmd === "-رصيد") {
    const target = message.mentions.users.first() || message.author;
    const bal = getBalance(target.id);
    const sto = getStorage(target.id);

    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🏦 رصيد الحساب")
        .setColor(0xfee75c)
        .setDescription(
          `> 👤 **العضو:** <@${target.id}>\n` +
          `> 💰 **الرصيد:** \`${formatAmount(bal)}\`\n` +
          `> 🗄️ **المخزنة:** \`${formatAmount(sto)}\`\n` +
          `> 💎 **الإجمالي:** \`${formatAmount(bal + sto)}\``
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: "البنك الرسمي" })
        .setTimestamp()]
    });
    return;
  }

  // -تحويل
  if (cmd === "-تحويل") {
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message.channel, "❌ | الاستخدام: `-تحويل @شخص مبلغ`");
    if (target.id === userId) return sendTemp(message.channel, "❌ | ما تحول لنفسك!");
    if (target.bot) return sendTemp(message.channel, "❌ | ما تحول للبوتات!");
    if (getBalance(userId) < amount)
      return sendTemp(message.channel, `❌ | رصيدك \`${formatAmount(getBalance(userId))}\` غير كافٍ!`);

    balances[userId]    = getBalance(userId) - amount;
    balances[target.id] = getBalance(target.id) + amount;

    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("💸 تحويل ناجح")
        .setColor(0x57f287)
        .setDescription(
          `> 📤 **من:** <@${userId}> (\`${formatAmount(getBalance(userId))}\`)\n` +
          `> 📥 **إلى:** <@${target.id}> (\`${formatAmount(getBalance(target.id))}\`)\n` +
          `> 💰 **المبلغ:** \`${formatAmount(amount)}\``
        )
        .setTimestamp()]
    });
    await target.send({
      embeds: [new EmbedBuilder()
        .setTitle("💰 وصلك تحويل!")
        .setColor(0x57f287)
        .setDescription(
          `> 📤 **من:** <@${userId}>\n` +
          `> 💵 **المبلغ:** \`${formatAmount(amount)}\`\n` +
          `> 🏦 **رصيدك:** \`${formatAmount(getBalance(target.id))}\``
        )
        .setTimestamp()]
    }).catch(() => {});
    return;
  }

  // !مخزنة
  if (cmd === "!مخزنة") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message.channel, "❌ | الاستخدام: `!مخزنة @شخص مبلغ`");

    storage[target.id] = getStorage(target.id) + amount;
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🗄️ تم الحفظ في المخزنة")
        .setColor(0x5865f2)
        .setDescription(
          `> 👤 **العضو:** <@${target.id}>\n` +
          `> ➕ **المضاف:** \`${formatAmount(amount)}\`\n` +
          `> 🗄️ **إجمالي المخزنة:** \`${formatAmount(getStorage(target.id))}\``
        )
        .setTimestamp()]
    });
    return;
  }

  // !جيب
  if (cmd === "!جيب") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message.channel, "❌ | الاستخدام: `!جيب @شخص مبلغ`");
    if (getStorage(target.id) < amount)
      return sendTemp(message.channel, `❌ | المخزنة ما تكفي! المتوفر: \`${formatAmount(getStorage(target.id))}\``);

    storage[target.id]  = getStorage(target.id) - amount;
    balances[target.id] = getBalance(target.id) + amount;
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("📦 سحب من المخزنة")
        .setColor(0x57f287)
        .setDescription(
          `> 👤 **العضو:** <@${target.id}>\n` +
          `> 💵 **المسحوب:** \`${formatAmount(amount)}\`\n` +
          `> 🗄️ **المخزنة المتبقية:** \`${formatAmount(getStorage(target.id))}\`\n` +
          `> 🏦 **الرصيد الجديد:** \`${formatAmount(getBalance(target.id))}\``
        )
        .setTimestamp()]
    });
    return;
  }

  // -تعال
  if (cmd === "-تعال") {
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message.channel, "❌ | الاستخدام: `-تعال @شخص`");
    await target.send({
      embeds: [new EmbedBuilder()
        .setTitle("👋 طلب حضور!")
        .setColor(0x5865f2)
        .setDescription(
          `> 📢 **<@${userId}> يطلبك في سيرفر ${message.guild.name}!**\n` +
          `> 📍 **القناة:** ${message.channel.url}`
        )
        .setTimestamp()]
    })
      .then(() => sendTemp(message.channel, `✅ | تم إشعار <@${target.id}>`))
      .catch(() => sendTemp(message.channel, `❌ | ما قدرت أوصل لـ <@${target.id}> (DM مغلق)`));
    return;
  }

  // -صديق
  if (cmd === "-صديق") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message.channel, "❌ | الاستخدام: `-صديق @شخص`");
    if (kings.has(target.id)) return sendTemp(message.channel, `ℹ️ | <@${target.id}> أصلاً ملك!`);

    await message.channel.send({
      content: `<@${userId}>`,
      embeds: [new EmbedBuilder()
        .setTitle("👑 منح صلاحيات الملك")
        .setColor(0xfee75c)
        .setDescription(
          `> هل تريد منح **<@${target.id}>** صلاحيات الملك؟\n` +
          `> ⚠️ **هذا القرار لا يمكن التراجع عنه بسهولة!**`
        )
        .setTimestamp()],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirm_friend_${target.id}`).setLabel("✅ نعم، منحه").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("cancel_friend").setLabel("❌ إلغاء").setStyle(ButtonStyle.Danger)
      )]
    });
    return;
  }

  // -اوامر
  if (cmd === "-اوامر") {
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("📋 قائمة الأوامر")
        .setColor(0x5865f2)
        .setDescription(
          "**💰 أوامر البنك (في روم البنك فقط):**\n" +
          "> `راتب` — راتبك بين 100–2500 ريال\n" +
          "> `الوان` — لعبة تخمين الألوان 🎨\n" +
          "> `نهب @شخص` — انهب شخص (45% نجاح)\n" +
          "> `ماين` — تعدين واكسب ريالات ⛏️\n" +
          "> `صاروخ مبلغ` — راهن واضرب حتى 5x 🚀\n" +
          "> `لعبه` — فردي أو زوجي 🎮\n" +
          "> `سلوت مبلغ` — ماكينة الحظ 🎰\n" +
          "> `كراش مبلغ` — الكراش المتصاعد 📈\n" +
          "> `نرد مبلغ` — تحدي النرد 🎲\n" +
          "> `اكس-او @شخص مبلغ` — تحدي اكس-او ❌⭕\n\n" +
          "**💸 أوامر عامة:**\n" +
          "> `-رصيد [@شخص]` — عرض الرصيد\n" +
          "> `-تحويل @شخص مبلغ` — تحويل رصيد\n" +
          "> `-تعال @شخص` — استدعاء شخص"
        )
        .setFooter({ text: "⚠️ كل أمر ربح له كول‐داون 5–10 دقايق" })
        .setTimestamp()]
    });
    return;
  }

  // !اوامر
  if (cmd === "!اوامر") {
    if (!isKing(userId)) return;
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("👑 أوامر الملوك")
        .setColor(0xfee75c)
        .setDescription(
          "> `!روم` — تخصيص روم البنك\n" +
          "> `!أبدأ٧٧` — إعداد روم التذاكر\n" +
          "> `-ارسال @شخص مبلغ` — إرسال رصيد\n" +
          "> `-سحب @شخص مبلغ` — سحب رصيد\n" +
          "> `!مخزنة @شخص مبلغ` — حفظ في الخزنة\n" +
          "> `!جيب @شخص مبلغ` — سحب من الخزنة\n" +
          "> `-صديق @شخص` — منح صلاحيات الملك"
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
  try {

    // ── زر "عرض الأوامر"
    if (interaction.isButton() && interaction.customId === "show_bank_commands") {
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("📋 كل أوامر البنك")
          .setColor(0x5865f2)
          .setDescription(
            "**💰 ألعاب الربح:**\n" +
            "> `راتب` — راتب يومي 100–2500 ريال\n" +
            "> `ماين` — تعدين ⛏️\n" +
            "> `صاروخ مبلغ` — مضاعف 0x–5x 🚀\n" +
            "> `سلوت مبلغ` — ماكينة الحظ 🎰\n" +
            "> `كراش مبلغ` — كراش 📈\n" +
            "> `نرد مبلغ` — نرد 🎲\n\n" +
            "**🎮 ألعاب تفاعلية:**\n" +
            "> `الوان` — تخمين الألوان 🎨\n" +
            "> `لعبه` — فردي/زوجي\n" +
            "> `اكس-او @شخص مبلغ` — تحدي ❌⭕\n" +
            "> `نهب @شخص` — نهب 🦹\n\n" +
            "**💸 أخرى:**\n" +
            "> `-رصيد` — رصيدك\n" +
            "> `-تحويل @شخص مبلغ` — تحويل"
          )
          .setFooter({ text: "⚠️ كل أمر له كول‐داون 5–10 دقايق" })],
        ephemeral: true
      });
      return;
    }

    // ── زر "رصيدي"
    if (interaction.isButton() && interaction.customId === "bank_my_balance") {
      const uid = interaction.user.id;
      const bal = getBalance(uid);
      const sto = getStorage(uid);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("🏦 رصيدك")
          .setColor(0xfee75c)
          .setDescription(
            `> 💰 **الرصيد:** \`${formatAmount(bal)}\`\n` +
            `> 🗄️ **المخزنة:** \`${formatAmount(sto)}\`\n` +
            `> 💎 **الإجمالي:** \`${formatAmount(bal + sto)}\``
          )
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()],
        ephemeral: true
      });
      return;
    }

    // ── زر "المتصدرين"
    if (interaction.isButton() && interaction.customId === "bank_leaderboard") {
      const sorted = Object.entries(balances)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

      const desc = sorted.length === 0
        ? "> لا يوجد بيانات بعد!"
        : sorted.map(([uid, bal], i) => `> ${medals[i]} <@${uid}> — \`${formatAmount(bal)}\``).join("\n");

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("🏆 أغنى الأعضاء")
          .setColor(0xfee75c)
          .setDescription(desc)
          .setTimestamp()],
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
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("👑 تم المنح!")
          .setColor(0x57f287)
          .setDescription(`> ✅ تم منح <@${targetId}> صلاحيات الملك!`)
          .setTimestamp()],
        components: []
      });
      return;
    }
    if (interaction.isButton() && interaction.customId === "cancel_friend") {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("> ❌ تم الإلغاء").setTimestamp()],
        components: []
      });
      return;
    }

    // ── كراش — سحب
    if (interaction.isButton() && interaction.customId.startsWith("crash_cashout_")) {
      const ownerId = interaction.customId.replace("crash_cashout_", "");
      if (interaction.user.id !== ownerId)
        return interaction.reply({ content: "❌ مو كراشك!", ephemeral: true });

      const sess = crashSessions[ownerId];
      if (!sess) return interaction.reply({ content: "❌ الكراش انتهى!", ephemeral: true });
      if (sess.cashed) return interaction.reply({ content: "❌ سبق وسحبت!", ephemeral: true });

      sess.cashed = true;
      const gain = Math.floor(sess.bet * sess.current);
      balances[ownerId] = getBalance(ownerId) + gain;
      delete crashSessions[ownerId];

      await interaction.update({
        content: `✅ | <@${ownerId}> سحب عند **${sess.current.toFixed(2)}x**!`,
        embeds: [new EmbedBuilder()
          .setTitle("✅ سحبت في الوقت المناسب!")
          .setColor(0x57f287)
          .setDescription(
            `> 📈 **سحب عند:** \`${sess.current.toFixed(2)}x\`\n` +
            `> 💵 **الرهان:** \`${formatAmount(sess.bet)}\`\n` +
            `> 💰 **الربح:** \`${formatAmount(gain - sess.bet)}\`\n` +
            `> 🏦 **رصيدك:** \`${formatAmount(getBalance(ownerId))}\``
          )
          .setTimestamp()],
        components: []
      });
      return;
    }

    // ── لعبة الألوان
    if (interaction.isButton() && interaction.customId.startsWith("cg_")) {
      const parts     = interaction.customId.split("_");
      const channelId = parts[1];
      const chosen    = parts[2];
      const session   = colorSessions[channelId];

      if (!session) return interaction.reply({ content: "❌ اللعبة انتهت!", ephemeral: true });
      if (interaction.user.id !== session.userId)
        return interaction.reply({ content: "❌ مو لعبتك!", ephemeral: true });

      session.attempts++;
      const boardStr = boardToString(session.board);

      if (chosen === session.target) {
        delete colorSessions[channelId];
        balances[session.userId] = getBalance(session.userId) + session.prize;
        const timeTaken = Math.floor((Date.now() - session.startTime) / 1000);

        await interaction.update({
          content: null,
          embeds: [new EmbedBuilder()
            .setTitle("🎨 ✅ صح! ربحت!")
            .setColor(0x57f287)
            .setDescription(
              "```\n" + boardStr + "\n```\n\n" +
              `> ✅ **<@${session.userId}> اخترت ${COLORS[session.target]} وهو صح!**\n` +
              `> 🔢 **عدد خانات ${COLORS[session.target]}:** \`${session.correct}\`\n` +
              `> 💰 **ربحت:** \`${formatAmount(session.prize)}\`\n` +
              `> 🏦 **رصيدك:** \`${formatAmount(getBalance(session.userId))}\`\n` +
              `> ⏱️ في ${timeTaken} ثانية | محاولة ${session.attempts}/${session.maxAttempts}`
            )
            .setTimestamp()],
          components: []
        });

      } else if (session.attempts >= session.maxAttempts) {
        delete colorSessions[channelId];
        await interaction.update({
          content: null,
          embeds: [new EmbedBuilder()
            .setTitle("🎨 ❌ خسرت! نفدت المحاولات")
            .setColor(0xed4245)
            .setDescription(
              "```\n" + boardStr + "\n```\n\n" +
              `> ❌ **نفدت المحاولات!**\n` +
              `> اللون الصح كان ${COLORS[session.target]} (**${session.correct}** خانة)`
            )
            .setTimestamp()],
          components: []
        });

      } else {
        const remaining = session.maxAttempts - session.attempts;
        const embed = new EmbedBuilder()
          .setTitle("🎨 الوان — حاول مجدداً!")
          .setColor(0xff9d00)
          .setDescription(
            "```\n" + boardStr + "\n```\n\n" +
            `> ❌ **${COLORS[chosen]} غلط! حاول مجدداً**\n` +
            `> 🎯 السؤال: كم مرة يظهر ${COLORS[session.target]}؟\n` +
            `> 🔢 **المحاولات:** ${session.attempts}/${session.maxAttempts} (باقي ${remaining})\n` +
            `> 💰 **الجائزة:** \`${formatAmount(session.prize)}\``
          )
          .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`cg_${channelId}_purple`).setLabel("🟪 بنفسجي").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`cg_${channelId}_yellow`).setLabel("🟨 أصفر").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`cg_${channelId}_brown`).setLabel("🟫 بني").setStyle(ButtonStyle.Secondary),
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`cg_${channelId}_blue`).setLabel("🟦 أزرق").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`cg_${channelId}_red`).setLabel("🟥 أحمر").setStyle(ButtonStyle.Danger),
        );

        await interaction.update({
          content: `<@${session.userId}> — **كم مرة يظهر ${COLORS[session.target]} في اللوحة؟**`,
          embeds: [embed],
          components: [row1, row2]
        });
      }
      return;
    }

    // ── لعبه فردي/زوجي
    if (interaction.isButton() &&
        (interaction.customId.startsWith("game_odd_") || interaction.customId.startsWith("game_even_"))) {
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
          embeds: [new EmbedBuilder()
            .setTitle("🎉 صح! ربحت!")
            .setColor(0x57f287)
            .setDescription(
              `> ✅ **<@${ownerId}> اخترت ${guess} وكان صح!**\n` +
              `> 💰 **ربحت:** \`${formatAmount(prize)}\`\n` +
              `> 🏦 **رصيدك:** \`${formatAmount(getBalance(ownerId))}\``
            )
            .setTimestamp()],
          components: []
        });
      } else {
        const loss = Math.floor(prize * 0.3);
        balances[ownerId] = Math.max(0, getBalance(ownerId) - loss);
        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle("❌ غلط! خسرت!")
            .setColor(0xed4245)
            .setDescription(
              `> ❌ **<@${ownerId}> اخترت ${guess} لكن الجواب كان ${correct}!**\n` +
              `> 💸 **الخسارة:** \`${formatAmount(loss)}\`\n` +
              `> 🏦 **رصيدك:** \`${formatAmount(getBalance(ownerId))}\``
            )
            .setTimestamp()],
          components: []
        });
      }
      return;
    }

    // ── اكس-او — قبول/رفض
    if (interaction.isButton() && interaction.customId.startsWith("ttt_accept_")) {
      const parts     = interaction.customId.split("_");
      const p1Id      = parts[2];
      const p2Id      = parts[3];
      const bet       = parseInt(parts[4]);
      const channelId = interaction.channel.id;

      if (interaction.user.id !== p2Id)
        return interaction.reply({ content: "❌ مو دعوتك!", ephemeral: true });
      if (getBalance(p2Id) < bet)
        return interaction.reply({ content: `❌ رصيدك \`${formatAmount(getBalance(p2Id))}\` غير كافٍ!`, ephemeral: true });

      balances[p1Id] = getBalance(p1Id) - bet;
      balances[p2Id] = getBalance(p2Id) - bet;

      const board = createTTTBoard();
      tttSessions[channelId] = {
        board, p1: p1Id, p2: p2Id, bet,
        turn: p1Id, symbol: { [p1Id]: "X", [p2Id]: "O" }
      };

      const embed = new EmbedBuilder()
        .setTitle("❌⭕ اكس-او")
        .setColor(0x5865f2)
        .setDescription(
          renderTTTBoard(board) + "\n\n" +
          `> ❌ **<@${p1Id}>** vs ⭕ **<@${p2Id}>**\n` +
          `> 💰 **الرهان:** \`${formatAmount(bet * 2)}\`\n` +
          `> 🎮 **دور:** <@${p1Id}> (❌)`
        )
        .setTimestamp();

      await interaction.update({
        content: null,
        embeds: [embed],
        components: buildTTTComponents(board, channelId)
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("ttt_decline_")) {
      const parts = interaction.customId.split("_");
      const p1Id  = parts[2];
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`> ❌ <@${interaction.user.id}> رفض التحدي`)
          .setTimestamp()],
        components: []
      });
      return;
    }

    // ── اكس-او — الأحجار
    if (interaction.isButton() && interaction.customId.startsWith("ttt_")) {
      const parts     = interaction.customId.split("_");
      if (parts[1] === "accept" || parts[1] === "decline") return;

      const channelId = parts[1];
      const cellIdx   = parseInt(parts[2]);
      const sess      = tttSessions[channelId];

      if (!sess) return interaction.reply({ content: "❌ اللعبة انتهت!", ephemeral: true });
      if (interaction.user.id !== sess.turn)
        return interaction.reply({ content: `❌ مو دورك! دور <@${sess.turn}>`, ephemeral: true });
      if (sess.board[cellIdx])
        return interaction.reply({ content: "❌ الخانة ممتلئة!", ephemeral: true });

      sess.board[cellIdx] = sess.symbol[interaction.user.id];
      const winner = checkTTTWinner(sess.board);
      const isDraw = !winner && sess.board.every(c => c !== null);

      if (winner) {
        const winnerId = winner === "X" ? sess.p1 : sess.p2;
        const loserId  = winner === "X" ? sess.p2 : sess.p1;
        const prize    = sess.bet * 2;
        balances[winnerId] = getBalance(winnerId) + prize;
        delete tttSessions[channelId];

        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle(`🎉 ${winner === "X" ? "❌" : "⭕"} فاز!`)
            .setColor(0x57f287)
            .setDescription(
              renderTTTBoard(sess.board) + "\n\n" +
              `> 🏆 **الفائز:** <@${winnerId}>\n` +
              `> 💰 **الجائزة:** \`${formatAmount(prize)}\`\n` +
              `> 🏦 **رصيده:** \`${formatAmount(getBalance(winnerId))}\``
            )
            .setTimestamp()],
          components: buildTTTComponents(sess.board, channelId, true)
        });

      } else if (isDraw) {
        balances[sess.p1] = getBalance(sess.p1) + sess.bet;
        balances[sess.p2] = getBalance(sess.p2) + sess.bet;
        delete tttSessions[channelId];

        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle("🤝 تعادل!")
            .setColor(0xfee75c)
            .setDescription(
              renderTTTBoard(sess.board) + "\n\n" +
              `> 🤝 **تعادل! رجع الرهان للجميع**`
            )
            .setTimestamp()],
          components: buildTTTComponents(sess.board, channelId, true)
        });

      } else {
        sess.turn = sess.turn === sess.p1 ? sess.p2 : sess.p1;
        const nextSym = sess.symbol[sess.turn];

        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle("❌⭕ اكس-او")
            .setColor(0x5865f2)
            .setDescription(
              renderTTTBoard(sess.board) + "\n\n" +
              `> ❌ <@${sess.p1}> vs ⭕ <@${sess.p2}>\n` +
              `> 💰 **الرهان:** \`${formatAmount(sess.bet * 2)}\`\n` +
              `> 🎮 **دور:** <@${sess.turn}> (${nextSym === "X" ? "❌" : "⭕"})`
            )
            .setTimestamp()],
          components: buildTTTComponents(sess.board, channelId)
        });
      }
      return;
    }

    // ── فتح التذكرة
    if (interaction.isButton() && interaction.customId === "open_ticket") {
      const modal = new ModalBuilder().setCustomId("ticket_modal").setTitle("فتح تذكرة دعم");
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_reason")
          .setLabel("سبب فتح التذكرة")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("اشرح مشكلتك بالتفصيل...")
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1000)
      ));
      await interaction.showModal(modal);
      return;
    }

    // ── إنشاء التذكرة
    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal") {
      const reason = interaction.fields.getTextInputValue("ticket_reason");
      const user   = interaction.user;
      const guild  = interaction.guild;
      ticketCounter++;
      const ticketNum   = String(ticketCounter).padStart(4, "0");
      const channelName = `ticket-${ticketNum}-${user.username}`.slice(0, 100).toLowerCase().replace(/[^a-z0-9-]/g, "-");

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
        ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: ticketCategoryId || null,
          permissionOverwrites: perms
        });
      } catch (e) {
        console.error(e);
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
        embeds: [new EmbedBuilder()
          .setTitle(`📋 تذكرة #${ticketNum}`)
          .setColor(0x5865f2)
          .setDescription(
            `> 👤 **صاحب التذكرة:** <@${user.id}>\n` +
            `> 📝 **السبب:**\n${reason}`
          )
          .addFields({ name: "⚡ الحالة", value: "🟡 قيد الانتظار", inline: true })
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: `تذكرة #${ticketNum} • البنك الرسمي` })
          .setTimestamp()],
        components: [ticketRow]
      });
      await interaction.reply({ content: `✅ تم فتح تذكرتك في ${ticketChannel}`, ephemeral: true });
      return;
    }

    // ── أزرار التذكرة
    if (interaction.isButton() && interaction.customId.startsWith("ping_support_")) {
      if (!supportRoleId) return interaction.reply({ content: "❌ رتبة الدعم غير محددة", ephemeral: true });
      const key = `pinged_${interaction.channel.id}_${interaction.user.id}`;
      if (!isKing(interaction.user.id) && !hasRole(interaction, supportRoleId)) {
        if (global[key]) return interaction.reply({ content: "❌ يمكنك منشن الدعم مرة واحدة فقط", ephemeral: true });
        global[key] = true;
      }
      await interaction.reply({ content: `<@&${supportRoleId}> 🔔` });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("ping_owner_")) {
      if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
        return interaction.reply({ content: "❌ هذا الزر للدعم فقط!", ephemeral: true });
      await interaction.reply({ content: `${[...kings].map(id => `<@${id}>`).join(" ")} 📢 لديك طلب في التذكرة!` });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("claim_ticket_")) {
      if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
        return interaction.reply({ content: "❌ هذا الزر للدعم فقط!", ephemeral: true });
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`> ✋ **<@${interaction.user.id}> استلم التذكرة!**`)
          .setTimestamp()]
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("delete_ticket_")) {
      if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
        return interaction.reply({ content: "❌ هذا الزر للدعم فقط!", ephemeral: true });
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("> 🗑️ **سيتم حذف التذكرة خلال 5 ثوانٍ...**")
          .setTimestamp()]
      });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

  } catch (err) {
    console.error("Interaction error:", err);
    try {
      const errMsg = { content: "❌ حدث خطأ، حاول مجدداً!", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errMsg);
      } else {
        await interaction.reply(errMsg);
      }
    } catch {}
  }
});

// ══════════════════════════════════════════════
//  HTTP Server
// ══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("🏦 البنك الرسمي • Bot is running!");
}).listen(PORT, () => console.log(`🌐 HTTP on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
