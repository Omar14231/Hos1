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

// ════════════════════════════════════════
//   إعدادات البوت
// ════════════════════════════════════════
const KING_ID = "1344009623887151155";
const kings = new Set([KING_ID]);

// قاعدة البيانات في الذاكرة
const balances  = {};   // { userId: number }
const storage   = {};   // { userId: number } — المخزنة
const cooldowns = {};   // { userId_cmd: timestamp }

let supportRoleId    = null;
let ticketCategoryId = null;
let ticketCounter    = 0;
let bankChannelId    = null; // روم أوامر البنك (!روم)

// مدة الكول‑داون لكل أمر ربح (بالمللي‑ثانية)  5–10 دقايق عشوائي
function getCooldownTime() {
  return (Math.floor(Math.random() * 6) + 5) * 60 * 1000; // 5–10 دقائق
}

// ════════════════════════════════════════
//   مساعدات عامة
// ════════════════════════════════════════
function isKing(userId)       { return kings.has(userId); }
function getBalance(userId)   { return balances[userId] || 0; }
function getStorage(userId)   { return storage[userId]  || 0; }

function parseAmount(str) {
  if (!str) return NaN;
  str = str
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/,/g, "")
    .trim()
    .toLowerCase();
  if (str.endsWith("k")) return parseFloat(str) * 1000;
  return parseFloat(str);
}

function formatAmount(num) {
  if (num >= 1000) return (num / 1000).toLocaleString("ar-SA") + "k ريال";
  return num.toLocaleString("ar-SA") + " ريال";
}

function formatMs(ms) {
  const m = Math.ceil(ms / 60000);
  return `${m} دقيقة`;
}

async function sendTemp(message, text, delay = 6000) {
  const m = await message.channel.send(text).catch(() => null);
  if (m) setTimeout(() => m.delete().catch(() => {}), delay);
}

function hasRole(interaction, roleId) {
  if (!roleId) return false;
  return interaction.member?.roles?.cache?.has(roleId);
}

// تحقق من الكول‑داون، يرجع { ok, remaining }
function checkCooldown(userId, cmd) {
  const key  = `${userId}_${cmd}`;
  const now  = Date.now();
  const last = cooldowns[key] || 0;
  const cd   = getCooldownTime();
  // نحفظ وقت الكول‑داون الخاص بكل مستخدم وأمر
  const expiry = cooldowns[`${key}_exp`] || 0;
  if (now < expiry) return { ok: false, remaining: expiry - now };
  // سجّل الوقت الجديد
  const newCd = getCooldownTime();
  cooldowns[`${key}_exp`] = now + newCd;
  return { ok: true };
}

// ════════════════════════════════════════
//   أوامر الربح (البنك)
// ════════════════════════════════════════

// راتب: 100–1578
async function cmdRatib(message) {
  const userId = message.author.id;
  const cd = checkCooldown(userId, "راتب");
  if (!cd.ok) {
    return sendTemp(message, `⏳ <@${userId}> لازم تنتظر **${formatMs(cd.remaining)}** قبل تاخذ راتبك!`);
  }
  const amount = Math.floor(Math.random() * (1578 - 100 + 1)) + 100;
  balances[userId] = getBalance(userId) + amount;

  const embed = new EmbedBuilder()
    .setTitle("💵 راتبك وصل!")
    .setColor(0x57f287)
    .setDescription(`<@${userId}> استلمت راتبك الشهري!`)
    .addFields(
      { name: "💰 المبلغ", value: formatAmount(amount), inline: true },
      { name: "🏦 رصيدك الحالي", value: formatAmount(getBalance(userId)), inline: true }
    )
    .setFooter({ text: "البنك الرسمي • أوامر الربح" })
    .setTimestamp();
  await message.channel.send({ embeds: [embed] });
}

// ماين: 50–900
async function cmdMine(message) {
  const userId = message.author.id;
  const cd = checkCooldown(userId, "ماين");
  if (!cd.ok) {
    return sendTemp(message, `⏳ <@${userId}> المعدن ما نضج بعد، انتظر **${formatMs(cd.remaining)}**!`);
  }
  const win  = Math.random() > 0.25; // 75% ربح
  const amount = Math.floor(Math.random() * (900 - 50 + 1)) + 50;

  if (win) {
    balances[userId] = getBalance(userId) + amount;
    const embed = new EmbedBuilder()
      .setTitle("⛏️ التعدين")
      .setColor(0xfee75c)
      .setDescription(`<@${userId}> حفرت وحصلت على كنز!`)
      .addFields(
        { name: "💎 الربح", value: formatAmount(amount), inline: true },
        { name: "🏦 الرصيد", value: formatAmount(getBalance(userId)), inline: true }
      )
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
  } else {
    const loss = Math.floor(Math.random() * 200) + 50;
    const actual = Math.min(loss, getBalance(userId));
    balances[userId] = getBalance(userId) - actual;
    const embed = new EmbedBuilder()
      .setTitle("⛏️ التعدين")
      .setColor(0xed4245)
      .setDescription(`<@${userId}> الحفرة انهارت عليك! خسرت ${formatAmount(actual)}`)
      .addFields({ name: "🏦 الرصيد", value: formatAmount(getBalance(userId)), inline: true })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
  }
}

// صاروخ: مضاعفة عالية أو خسارة
async function cmdSaroukh(message, args) {
  const userId = message.author.id;
  const betRaw = args[1];
  if (!betRaw) return sendTemp(message, "❌ الاستخدام: `-صاروخ المبلغ`");

  // دعم "ذكر المبلغ" كنص
  const bet = parseAmount(betRaw);
  if (isNaN(bet) || bet <= 0) return sendTemp(message, "❌ اكتب مبلغاً صحيحاً");
  if (getBalance(userId) < bet) return sendTemp(message, "❌ رصيدك ما يكفي!");

  const cd = checkCooldown(userId, "صاروخ");
  if (!cd.ok) {
    return sendTemp(message, `⏳ الصاروخ في إعادة تحميل، انتظر **${formatMs(cd.remaining)}**!`);
  }

  const multiplier = [1.5, 2, 2.5, 3, 0, 0.5][Math.floor(Math.random() * 6)];
  const gain = Math.floor(bet * multiplier);

  balances[userId] = getBalance(userId) - bet + gain;

  let color, title, desc;
  if (multiplier === 0) {
    color = 0xed4245; title = "🚀💥 الصاروخ انفجر!";
    desc  = `خسرت كل رهانك ${formatAmount(bet)}`;
  } else if (multiplier < 1) {
    color = 0xff9d00; title = "🚀 الصاروخ اهبط مبكر";
    desc  = `خسرت نص الرهان، استردت ${formatAmount(gain)}`;
  } else if (multiplier >= 3) {
    color = 0x57f287; title = "🚀🌟 الصاروخ وصل الفضاء!";
    desc  = `ربحت **${multiplier}x** = ${formatAmount(gain)}`;
  } else {
    color = 0x57f287; title = "🚀 الصاروخ طار!";
    desc  = `ربحت **${multiplier}x** = ${formatAmount(gain)}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(`<@${userId}> ${desc}`)
    .addFields(
      { name: "💵 الرهان", value: formatAmount(bet), inline: true },
      { name: "🏦 الرصيد", value: formatAmount(getBalance(userId)), inline: true }
    )
    .setTimestamp();
  await message.channel.send({ embeds: [embed] });
}

// لعبة: أحجية عشوائية
const GAMES = [
  { q: "🎲 فردي أم زوجي؟ اكتب `فردي` أو `زوجي`", answers: () => {
    const n = Math.floor(Math.random() * 10) + 1;
    return { correct: n % 2 === 0 ? "زوجي" : "فردي", result: `الرقم كان ${n}` };
  }},
  { q: "🪙 صورة أو كتابة؟ اكتب `صورة` أو `كتابة`", answers: () => {
    const r = Math.random() > 0.5 ? "صورة" : "كتابة";
    return { correct: r, result: `الطلعت ${r}` };
  }},
];

async function cmdGame(message) {
  const userId = message.author.id;
  const cd = checkCooldown(userId, "لعبه");
  if (!cd.ok) {
    return sendTemp(message, `⏳ <@${userId}> العبة مو جاهزة، انتظر **${formatMs(cd.remaining)}**!`);
  }

  const game    = GAMES[Math.floor(Math.random() * GAMES.length)];
  const answers = game.answers();
  const prize   = Math.floor(Math.random() * 800) + 200;

  const askMsg = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎮 لعبة البنك")
        .setColor(0x5865f2)
        .setDescription(`<@${userId}> ${game.q}\n💰 الجائزة: **${formatAmount(prize)}**\n⏱️ عندك 20 ثانية!`)
        .setTimestamp()
    ]
  });

  const filter  = m => m.author.id === userId;
  const collector = message.channel.createMessageCollector({ filter, time: 20000, max: 1 });

  collector.on("collect", async m => {
    await m.delete().catch(() => {});
    await askMsg.delete().catch(() => {});
    const answer = m.content.trim().toLowerCase();
    if (answer === answers.correct) {
      balances[userId] = getBalance(userId) + prize;
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎉 صح! ربحت!")
            .setColor(0x57f287)
            .setDescription(`${answers.result}\n<@${userId}> ربحت **${formatAmount(prize)}**\n🏦 رصيدك: **${formatAmount(getBalance(userId))}**`)
            .setTimestamp()
        ]
      });
    } else {
      const loss = Math.floor(Math.random() * 200) + 100;
      const actual = Math.min(loss, getBalance(userId));
      balances[userId] = getBalance(userId) - actual;
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ غلط! خسرت!")
            .setColor(0xed4245)
            .setDescription(`${answers.result}\n<@${userId}> خسرت **${formatAmount(actual)}**\n🏦 رصيدك: **${formatAmount(getBalance(userId))}**`)
            .setTimestamp()
        ]
      });
    }
  });

  collector.on("end", collected => {
    if (collected.size === 0) {
      askMsg.delete().catch(() => {});
      message.channel.send(`⏰ <@${userId}> انتهى الوقت، خسرت فرصتك!`).then(m => {
        setTimeout(() => m.delete().catch(() => {}), 5000);
      });
    }
  });
}

// ════════════════════════════════════════
//   قوائم الأوامر
// ════════════════════════════════════════
function buildHelpEmbed(isKingUser) {
  const memberCmds = [
    { name: "راتب",              value: "تاخذ راتب يومي بين 100–1578 ريال" },
    { name: "-ماين",             value: "تعدين: اربح أو اخسر" },
    { name: "-صاروخ [مبلغ]",    value: "راهن واضرب حتى 3x أو انفجر" },
    { name: "-لعبه",             value: "لعبة تخمين، اربح أو اخسر" },
    { name: "-رصيد [@شخص]",     value: "اعرض رصيدك أو رصيد شخص" },
    { name: "-تحويل @شخص مبلغ", value: "حوّل من رصيدك لشخص آخر" },
    { name: "-تعال @شخص",        value: "إشعار شخص في خاص" },
    { name: "-اوامر",            value: "قائمة أوامر الأعضاء" },
  ];

  const kingCmds = [
    { name: "!أبدأ٧٧",                  value: "إعداد روم التذاكر + رتبة الدعم" },
    { name: "!روم",                      value: "تخصيص الروم الحالي كروم أوامر البنك" },
    { name: "-ارسال @شخص مبلغ",         value: "إرسال مبلغ لشخص" },
    { name: "-سحب @شخص مبلغ",           value: "سحب من رصيد شخص" },
    { name: "!مخزنة @شخص مبلغ",         value: "حفظ مبلغ في خزنة شخص" },
    { name: "!جيب @شخص مبلغ",           value: "سحب من الخزنة للرصيد" },
    { name: "-صديق @شخص",               value: "منح شخص صلاحيات الملك" },
    { name: "!اوامر",                    value: "قائمة أوامر الملوك الكاملة" },
  ];

  const embed = new EmbedBuilder()
    .setTitle("📋 أوامر البنك الرسمي")
    .setColor(0x5865f2)
    .setFooter({ text: "البنك الرسمي • كل الأوامر لها كول‑داون 5–10 دقايق" })
    .setTimestamp();

  const memberField = memberCmds.map(c => `\`${c.name}\` — ${c.value}`).join("\n");
  embed.addFields({ name: "👥 أوامر الأعضاء", value: memberField });

  if (isKingUser) {
    const kingField = kingCmds.map(c => `\`${c.name}\` — ${c.value}`).join("\n");
    embed.addFields({ name: "👑 أوامر الملوك", value: kingField });
  }

  return embed;
}

// ════════════════════════════════════════
//   حدث: رسالة جديدة
// ════════════════════════════════════════
client.once("ready", () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const args    = content.split(/\s+/);
  const cmd     = args[0];
  const userId  = message.author.id;

  // ── تحقق: هل الروم مخصص للبنك؟ (للأوامر التي تحتاج ذلك)
  const earnCmds = ["راتب", "-ماين", "-صاروخ", "-لعبه"];
  if (earnCmds.includes(cmd) && bankChannelId && message.channel.id !== bankChannelId) {
    return sendTemp(message, `❌ استخدم أوامر البنك في <#${bankChannelId}> فقط!`);
  }

  // ════════════════════════════════════
  //  !روم — للملوك: تخصيص الروم للبنك
  // ════════════════════════════════════
  if (cmd === "!روم") {
    if (!isKing(userId)) return;
    bankChannelId = message.channel.id;

    const embed = new EmbedBuilder()
      .setTitle("🏦 روم أوامر البنك")
      .setColor(0x5865f2)
      .setDescription(
        "مرحباً بك في روم أوامر البنك الرسمي!\n\n" +
        "📌 هنا تقدر تستخدم أوامر البنك وتربح الريالات\n" +
        "⚠️ كل أمر له كول‑داون من **5 إلى 10 دقايق**\n\n" +
        "اكتب `-اوامر` لتشوف كل الأوامر المتاحة 👇"
      )
      .addFields(
        { name: "💵 راتب",           value: "اكتب `راتب`",        inline: true },
        { name: "⛏️ ماين",            value: "اكتب `-ماين`",       inline: true },
        { name: "🚀 صاروخ",           value: "اكتب `-صاروخ مبلغ`", inline: true },
        { name: "🎮 لعبة",            value: "اكتب `-لعبه`",       inline: true }
      )
      .setFooter({ text: "البنك الرسمي • حظ سعيد!" })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await sendTemp(message, `✅ تم تخصيص هذا الروم كروم أوامر البنك!`);
    return;
  }

  // ════════════════════════════════════
  //  !أبدأ٧٧ — للملك: إعداد التذاكر
  // ════════════════════════════════════
  if (cmd === "!أبدأ٧٧") {
    if (!isKing(userId)) return;
    await message.delete().catch(() => {});

    const askMsg = await message.channel.send({
      content: `<@${userId}> منشن رتبة الدعم البنك المخصصة للتذاكر 👇`,
    });

    const filter = m => m.author.id === userId && m.mentions.roles.size > 0;
    const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on("collect", async m => {
      const role = m.mentions.roles.first();
      supportRoleId    = role.id;
      ticketCategoryId = message.channel.parentId;
      await m.delete().catch(() => {});
      await askMsg.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle("🏦 دعم البنك الفني")
        .setDescription(
          "مرحباً بك في نظام دعم البنك\n\n" +
          "📌 هذا الروم مخصص لفتح تذاكر الدعم الفني\n" +
          "🔧 في حال وجود أي خطأ تقني أو استفسار، اضغط على الزر أدناه\n\n" +
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

    collector.on("end", collected => {
      if (collected.size === 0) {
        message.channel.send("⏰ انتهى الوقت، أعد الأمر.")
          .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      }
    });
    return;
  }

  // ════════════════════════════════════
  //  أوامر الربح
  // ════════════════════════════════════
  if (cmd === "راتب")    return cmdRatib(message);
  if (cmd === "-ماين")   return cmdMine(message);
  if (cmd === "-صاروخ")  return cmdSaroukh(message, args);
  if (cmd === "-لعبه")   return cmdGame(message);

  // ════════════════════════════════════
  //  -اوامر (للأعضاء)   !اوامر (للملوك)
  // ════════════════════════════════════
  if (cmd === "-اوامر") {
    const embed = buildHelpEmbed(false);
    embed.setTitle("📋 أوامر الأعضاء — البنك الرسمي");
    await message.channel.send({ embeds: [embed] });
    return;
  }
  if (cmd === "!اوامر") {
    if (!isKing(userId)) return;
    const embed = buildHelpEmbed(true);
    embed.setTitle("👑 أوامر الملوك — البنك الرسمي");
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ════════════════════════════════════
  //  -رصيد [@منشن]
  // ════════════════════════════════════
  if (cmd === "-رصيد") {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle("🏦 رصيد الحساب")
      .setColor(0xfee75c)
      .addFields(
        { name: "العضو",  value: `<@${target.id}>`,             inline: true },
        { name: "الرصيد", value: formatAmount(getBalance(target.id)), inline: true }
      )
      .setFooter({ text: "البنك الرسمي" })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ════════════════════════════════════
  //  -ارسال @منشن مبلغ — للملوك
  // ════════════════════════════════════
  if (cmd === "-ارسال") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message, "❌ الاستخدام: `-ارسال @شخص المبلغ`");

    balances[target.id] = getBalance(target.id) + amount;

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💸 تحويل ناجح")
          .setColor(0x57f287)
          .addFields(
            { name: "المستلم",        value: `<@${target.id}>`,                inline: true },
            { name: "المبلغ",         value: formatAmount(amount),              inline: true },
            { name: "الرصيد الجديد", value: formatAmount(getBalance(target.id)), inline: true }
          )
          .setTimestamp()
      ]
    });

    await target.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 وصلك تحويل!")
          .setColor(0x57f287)
          .setDescription(
            `تم إيداع **${formatAmount(amount)}** في حسابك\n` +
            `رصيدك الحالي: **${formatAmount(getBalance(target.id))}**`
          )
          .setTimestamp()
      ]
    }).catch(() => {});
    return;
  }

  // ════════════════════════════════════
  //  -سحب @منشن مبلغ — للملوك
  // ════════════════════════════════════
  if (cmd === "-سحب") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message, "❌ الاستخدام: `-سحب @شخص المبلغ`");
    if (getBalance(target.id) < amount)
      return sendTemp(message, `❌ رصيد <@${target.id}> غير كافٍ`);

    balances[target.id] = getBalance(target.id) - amount;

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏧 سحب")
          .setColor(0xed4245)
          .addFields(
            { name: "العضو",          value: `<@${target.id}>`,                inline: true },
            { name: "المسحوب",        value: formatAmount(amount),              inline: true },
            { name: "الرصيد الجديد", value: formatAmount(getBalance(target.id)), inline: true }
          )
          .setTimestamp()
      ]
    });

    await target.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏧 تم سحب من حسابك")
          .setColor(0xed4245)
          .setDescription(
            `تم سحب **${formatAmount(amount)}** من حسابك\n` +
            `رصيدك الحالي: **${formatAmount(getBalance(target.id))}**`
          )
          .setTimestamp()
      ]
    }).catch(() => {});
    return;
  }

  // ════════════════════════════════════
  //  -تحويل @منشن مبلغ — للجميع
  // ════════════════════════════════════
  if (cmd === "-تحويل") {
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message, "❌ الاستخدام: `-تحويل @شخص المبلغ`");
    if (target.id === userId)
      return sendTemp(message, "❌ ما تقدر تحول لنفسك");
    if (getBalance(userId) < amount)
      return sendTemp(message, "❌ رصيدك غير كافٍ");

    balances[userId]     = getBalance(userId) - amount;
    balances[target.id]  = getBalance(target.id) + amount;

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💸 تحويل ناجح")
          .setColor(0x57f287)
          .addFields(
            { name: "من",     value: `<@${userId}>`,    inline: true },
            { name: "إلى",    value: `<@${target.id}>`, inline: true },
            { name: "المبلغ", value: formatAmount(amount), inline: true }
          )
          .setTimestamp()
      ]
    });

    await target.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 وصلك تحويل!")
          .setColor(0x57f287)
          .setDescription(
            `حوّل لك <@${userId}> مبلغ **${formatAmount(amount)}**\n` +
            `رصيدك الحالي: **${formatAmount(getBalance(target.id))}**`
          )
          .setTimestamp()
      ]
    }).catch(() => {});
    return;
  }

  // ════════════════════════════════════
  //  !مخزنة @منشن مبلغ — للملوك
  // ════════════════════════════════════
  if (cmd === "!مخزنة") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message, "❌ الاستخدام: `!مخزنة @شخص المبلغ`");

    storage[target.id] = getStorage(target.id) + amount;

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🗄️ تم الحفظ في المخزنة")
          .setColor(0x5865f2)
          .addFields(
            { name: "العضو",          value: `<@${target.id}>`,                inline: true },
            { name: "المضاف",         value: formatAmount(amount),              inline: true },
            { name: "إجمالي المخزنة", value: formatAmount(getStorage(target.id)), inline: true }
          )
          .setTimestamp()
      ]
    });
    return;
  }

  // ════════════════════════════════════
  //  !جيب @منشن مبلغ — للملوك
  // ════════════════════════════════════
  if (cmd === "!جيب") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    const amount = parseAmount(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return sendTemp(message, "❌ الاستخدام: `!جيب @شخص المبلغ`");
    if (getStorage(target.id) < amount) {
      return sendTemp(
        message,
        `❌ المبلغ غير كافٍ في الخزنة الخاصة بـ <@${target.id}>\n` +
        `المتوفر: **${formatAmount(getStorage(target.id))}**`
      );
    }

    storage[target.id]   = getStorage(target.id) - amount;
    balances[target.id]  = getBalance(target.id) + amount;

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("📦 سحب من المخزنة")
          .setColor(0x57f287)
          .addFields(
            { name: "العضو",            value: `<@${target.id}>`,                inline: true },
            { name: "المسحوب",          value: formatAmount(amount),              inline: true },
            { name: "المخزنة المتبقية", value: formatAmount(getStorage(target.id)), inline: true },
            { name: "الرصيد الجديد",   value: formatAmount(getBalance(target.id)), inline: true }
          )
          .setTimestamp()
      ]
    });
    return;
  }

  // ════════════════════════════════════
  //  -تعال @منشن — للجميع
  // ════════════════════════════════════
  if (cmd === "-تعال") {
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message, "❌ الاستخدام: `-تعال @شخص`");

    await target.send(
      `👋 مرحباً! طلب منك <@${userId}> في سيرفر **${message.guild.name}** أن تحضر!\n` +
      `📍 الروم: ${message.channel.url}`
    ).then(() => {
      sendTemp(message, `✅ تم إشعار <@${target.id}> في الخاص`);
    }).catch(() => {
      sendTemp(message, `❌ ما قدرت أوصل لـ <@${target.id}> (أغلق الخاص)`);
    });
    return;
  }

  // ════════════════════════════════════
  //  -صديق @منشن — للملوك
  // ════════════════════════════════════
  if (cmd === "-صديق") {
    if (!isKing(userId)) return;
    const target = message.mentions.users.first();
    if (!target) return sendTemp(message, "❌ الاستخدام: `-صديق @شخص`");
    if (kings.has(target.id))
      return sendTemp(message, `ℹ️ <@${target.id}> أصلاً لديه صلاحيات الملك`);

    const row = new ActionRowBuilder().addComponents(
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
      content:
        `<@${userId}> هل أنت متأكد أنك تريد منح **<@${target.id}>** صلاحيات الملك؟\n` +
        `سيصبح قادراً على استخدام جميع الأوامر.`,
      components: [row],
    });
    return;
  }
});

// ════════════════════════════════════════
//   تفاعلات الأزرار والمودالز
// ════════════════════════════════════════
client.on("interactionCreate", async (interaction) => {

  // ── تأكيد الصديق
  if (interaction.isButton() && interaction.customId.startsWith("confirm_friend_")) {
    if (!isKing(interaction.user.id))
      return interaction.reply({ content: "❌ ليس لديك صلاحية", ephemeral: true });
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

  // ── فتح التذكرة: مودال
  if (interaction.isButton() && interaction.customId === "open_ticket") {
    const modal = new ModalBuilder()
      .setCustomId("ticket_modal")
      .setTitle("فتح تذكرة دعم");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_reason")
          .setLabel("اكتب سبب فتحك للتذكرة")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("اشرح مشكلتك أو استفسارك بالتفصيل...")
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1000)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // ── استلام المودال وإنشاء روم التذكرة
  if (interaction.isModalSubmit() && interaction.customId === "ticket_modal") {
    const reason = interaction.fields.getTextInputValue("ticket_reason");
    const user   = interaction.user;
    const guild  = interaction.guild;

    ticketCounter++;
    const ticketNum     = String(ticketCounter).padStart(4, "0");
    const channelName   = `𝗧𝗶𝗰𝗸𝗲𝘁-${ticketNum}-${user.username}`.slice(0, 100);

    const permissionOverwrites = [
      { id: guild.id,        deny:  [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id,         allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id,  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory] },
    ];
    if (supportRoleId) {
      permissionOverwrites.push({
        id: supportRoleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages],
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

    const ticketEmbed = new EmbedBuilder()
      .setTitle(`📋 تذكرة #${ticketNum}`)
      .setColor(0x5865f2)
      .setDescription(`مرحباً <@${user.id}>! تم فتح تذكرتك\n\n**سبب التذكرة:**\n${reason}`)
      .addFields({ name: "الحالة", value: "🟡 قيد الانتظار", inline: true })
      .setFooter({ text: `التذكرة #${ticketNum}` })
      .setTimestamp();

    const ticketRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ping_owner_${ticketChannel.id}`).setLabel("📢 منشن الأونر").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ping_support_${ticketChannel.id}`).setLabel("🔔 منشن الدعم").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`claim_ticket_${ticketChannel.id}`).setLabel("✋ استلام").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`delete_ticket_${ticketChannel.id}`).setLabel("🗑️ حذف التذكرة").setStyle(ButtonStyle.Secondary)
    );

    const supportMention = supportRoleId ? `<@&${supportRoleId}>` : "";
    await ticketChannel.send({ content: `${supportMention} <@${user.id}>`, embeds: [ticketEmbed], components: [ticketRow] });
    await interaction.reply({ content: `✅ تم فتح تذكرتك في ${ticketChannel}`, ephemeral: true });
    return;
  }

  // ── منشن الدعم (مرة واحدة للأعضاء)
  if (interaction.isButton() && interaction.customId.startsWith("ping_support_")) {
    if (!supportRoleId)
      return interaction.reply({ content: "❌ رتبة الدعم غير محددة", ephemeral: true });

    const key = `pinged_${interaction.channel.id}_${interaction.user.id}`;
    if (!isKing(interaction.user.id) && !hasRole(interaction, supportRoleId)) {
      if (global[key])
        return interaction.reply({ content: "❌ لا يمكنك منشنة الدعم أكثر من مرة", ephemeral: true });
      global[key] = true;
    }
    await interaction.reply({ content: `<@&${supportRoleId}>` });
    return;
  }

  // ── منشن الأونر (للدعم فقط)
  if (interaction.isButton() && interaction.customId.startsWith("ping_owner_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
      return interaction.reply({ content: "❌ هذا الزر للدعم فقط", ephemeral: true });
    const mentions = [...kings].map(id => `<@${id}>`).join(" ");
    await interaction.reply({ content: `${mentions} 📢 طلب من الدعم` });
    return;
  }

  // ── استلام التذكرة (للدعم فقط)
  if (interaction.isButton() && interaction.customId.startsWith("claim_ticket_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
      return interaction.reply({ content: "❌ هذا الزر للدعم فقط", ephemeral: true });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ تم استلام التذكرة من قِبَل <@${interaction.user.id}>`)
      ]
    });
    return;
  }

  // ── حذف التذكرة (للدعم فقط)
  if (interaction.isButton() && interaction.customId.startsWith("delete_ticket_")) {
    if (!hasRole(interaction, supportRoleId) && !isKing(interaction.user.id))
      return interaction.reply({ content: "❌ هذا الزر للدعم فقط", ephemeral: true });
    await interaction.reply({ content: "🗑️ سيتم حذف التذكرة خلال 5 ثوانٍ..." });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }
});

// ════════════════════════════════════════
//   سيرفر وهمي لـ Render (Web Service)
// ════════════════════════════════════════
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running!");
}).listen(PORT, () => {
  console.log(`🌐 HTTP server listening on port ${PORT}`);
});

// ════════════════════════════════════════
//   تشغيل البوت
// ════════════════════════════════════════
client.login(process.env.DISCORD_TOKEN);
