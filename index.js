// ============================
// Central Bank Bot - index.js
// ============================
// ضع التوكن في متغير البيئة DISCORD_TOKEN في Render
// ============================

// HTTP Server لـ Render (مطلوب حتى لا يوقف الخدمة)
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running! ✅");
}).listen(PORT, () => console.log(`🌐 HTTP Server على البورت ${PORT}`));

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, ChannelType, PermissionOverwrites } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// ============================
// إعدادات ثابتة
// ============================
const OWNER_ID = "1344009623887151155";       // الملك
const TRUSTED_ID = "1306034100544737461";     // الشخص الموثوق
const TOKEN = process.env.DISCORD_TOKEN;

// ============================
// تخزين مؤقت في الذاكرة
// ============================
let eventChannelId = null;         // روم الفعليات
let bankChannelId = null;          // روم البنك
let ticketCategoryId = null;       // مجلد التكتات
let ticketRoleId = null;           // رتبة مسؤول التكت
let eventRoleId = null;            // رتبة الفعليات
let protectionEnabled = false;     // الحماية
let allowedUsers = new Set([OWNER_ID, TRUSTED_ID]); // المسموح لهم

// بيانات الألعاب
const playerData = {};             // { userId: { points, frozen, frozenRounds } }
const activeGames = {};            // ألعاب نشطة { channelId: gameData }
const marriages = {};              // { userId: partnerId }

// Ping Render كل 5 دقائق لمنع النوم
const RENDER_URL = process.env.RENDER_URL || "";
if (RENDER_URL) {
  setInterval(() => {
    require("https").get(RENDER_URL, () => {}).on("error", () => {});
  }, 5 * 60 * 1000);
}

// ============================
// مساعدات
// ============================
function getPlayer(userId) {
  if (!playerData[userId]) playerData[userId] = { points: 0, frozen: false, frozenRounds: 0 };
  return playerData[userId];
}

function isOwner(userId) {
  return userId === OWNER_ID;
}
function isTrusted(userId) {
  return userId === TRUSTED_ID || userId === OWNER_ID;
}
function isAllowed(userId) {
  return allowedUsers.has(userId);
}

function fancy(title, desc, color = 0x9b59b6) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
}

// ============================
// حدث Ready
// ============================
client.once("ready", () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
});

// ============================
// حماية السيرفر
// ============================
async function restoreProtection(guild, executor, action) {
  if (!protectionEnabled) return;
  if (isAllowed(executor)) return;

  // أرسل تحذير
  const logChannel = guild.channels.cache.find(c => c.name === "general" || c.name === "عام");
  if (logChannel) {
    await logChannel.send({
      embeds: [fancy("🛡️ الحماية", `⚠️ <@${executor}> حاول يسوي: **${action}** وتم التراجع عنه!\n<@${OWNER_ID}> <@${TRUSTED_ID}>`, 0xe74c3c)]
    }).catch(() => {});
  }
}

// مراقبة إنشاء الرومات
client.on("channelCreate", async channel => {
  if (!protectionEnabled) return;
  const auditLogs = await channel.guild.fetchAuditLogs({ type: 10, limit: 1 }).catch(() => null);
  const entry = auditLogs?.entries.first();
  if (!entry || isAllowed(entry.executor.id)) return;
  await channel.delete().catch(() => {});
  await restoreProtection(channel.guild, entry.executor.id, "إنشاء روم");
});

// مراقبة حذف الرومات
client.on("channelDelete", async channel => {
  if (!protectionEnabled) return;
  const auditLogs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 }).catch(() => null);
  const entry = auditLogs?.entries.first();
  if (!entry || isAllowed(entry.executor.id)) return;
  // إعادة إنشاء الروم
  const restored = await channel.guild.channels.create({
    name: channel.name,
    type: channel.type,
    parent: channel.parentId,
  }).catch(() => null);
  await restoreProtection(channel.guild, entry.executor.id, `حذف روم ${channel.name}`);
});

// مراقبة إنشاء الرتب
client.on("roleCreate", async role => {
  if (!protectionEnabled) return;
  const auditLogs = await role.guild.fetchAuditLogs({ type: 30, limit: 1 }).catch(() => null);
  const entry = auditLogs?.entries.first();
  if (!entry || isAllowed(entry.executor.id)) return;
  await role.delete().catch(() => {});
  await restoreProtection(role.guild, entry.executor.id, "إنشاء رتبة");
});

// ============================
// معالج الرسائل
// ============================
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  const { content, channel, guild, author, member } = message;
  const msg = content.trim();
  const userId = author.id;

  // ==============================
  //  أمر !فعليات
  // ==============================
  if (msg === "!فعليات") {
    if (!isOwner(userId)) {
      return message.reply({ embeds: [fancy("🚫 ممنوع", "هذا الأمر للملك فقط!", 0xe74c3c)] });
    }
    eventChannelId = channel.id;
    await message.reply({
      embeds: [fancy("✅ روم الفعليات", `تم تخصيص هذا الروم للفعليات!\n\nمنشن الرتبة المخصصة للفعليات لتفعيلها:`, 0x2ecc71)]
    });
    return;
  }

  // إذا منشن رتبة بعد تفعيل !فعليات
  if (eventChannelId === channel.id && message.mentions.roles.size > 0 && isOwner(userId)) {
    eventRoleId = message.mentions.roles.first()?.id;
    await message.reply({
      embeds: [fancy("🎮 الفعليات جاهزة!", `تم تخصيص الرتبة للفعليات!\n\n**أوامر الفعليات المتاحة:**\n\n**ألعاب السيرفر:**\n\`-روليت\` \`-xo\` \`-مافيا\` \`-كراسي\` \`-حجرة\` \`-نرد\` \`-عجلة\` \`-hotxo\` \`-غميضة\` \`-ريبلكا\` \`-خمن\`\n\n**ألعاب فردية:**\n\`-زر\` \`-اسرع\` \`-فكك\` \`-ادمج\` \`-اعلام\` \`-اعكس\` \`-حرف\` \`-صحح\` \`-ترتيب\` \`-الوان\` \`-ايموجي\` \`-اكشف\``, 0x3498db)]
    });
    return;
  }

  // ==============================
  //  أمر !روم → خصصه للبنك
  // ==============================
  if (msg === "!روم") {
    if (!isOwner(userId)) return message.reply({ embeds: [fancy("🚫", "للملك فقط!", 0xe74c3c)] });
    bankChannelId = channel.id;
    await channel.setName("🏦・البنك-المركزي").catch(() => {});
    await message.reply({
      embeds: [fancy("🏦 البنك المركزي", "✅ تم تخصيص هذا الروم للبنك!\n\n**أوامر البنك:**\n• كشف الرصيد\n• تحويل\n• بخشيش\n• راتب\n• نهب\n• قرض\n• تسديد\n• هدية\n• أسعار\n• شراء\n• بيع\n• ممتلكات", 0xf1c40f)]
    });
    return;
  }

  // ==============================
  //  أمر !تكت → نظام التذاكر
  // ==============================
  if (msg === "!تكت") {
    if (!isOwner(userId)) return message.reply({ embeds: [fancy("🚫", "للملك فقط!", 0xe74c3c)] });
    await message.reply({
      embeds: [fancy("🎫 نظام التذاكر", "منشن الرتبة المخصصة لمسؤولي التذاكر:")]
    });
    // ننتظر الرد في الحدث التالي
    const filter = m => m.author.id === OWNER_ID && m.mentions.roles.size > 0;
    const collector = channel.createMessageCollector({ filter, time: 30000, max: 1 });
    collector.on("collect", async m => {
      ticketRoleId = m.mentions.roles.first()?.id;
      ticketCategoryId = channel.parentId;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_ticket").setLabel("📩 فتح تذكرة").setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [fancy("🎫 نظام التذاكر", "اضغط الزر أدناه لفتح تذكرة دعم!\n\n**سيتم إنشاء روم خاص بك**", 0x9b59b6)],
        components: [row]
      });
    });
    return;
  }

  // ==============================
  //  أمر !حماية
  // ==============================
  if (msg === "!حماية") {
    if (!isOwner(userId)) return message.reply({ embeds: [fancy("🚫", "للملك فقط!", 0xe74c3c)] });
    protectionEnabled = !protectionEnabled;
    await message.reply({
      embeds: [fancy(
        protectionEnabled ? "🛡️ الحماية مفعلة" : "🔓 الحماية معطلة",
        protectionEnabled
          ? "✅ تم تفعيل الحماية!\nأنت وحدك المسموح لك بالتغييرات.\nلمنح صلاحية شخص: `مسموح @شخص`"
          : "⚠️ تم إيقاف الحماية.",
        protectionEnabled ? 0x2ecc71 : 0xe74c3c
      )]
    });
    return;
  }

  // ==============================
  //  أمر: مسموح @شخص
  // ==============================
  if (msg.startsWith("مسموح") && message.mentions.users.size > 0) {
    if (!isOwner(userId)) return;
    const target = message.mentions.users.first();
    allowedUsers.add(target.id);
    await message.reply({ embeds: [fancy("✅ تم السماح", `<@${target.id}> مسموح له بالتصرف في السيرفر!`, 0x2ecc71)] });
    return;
  }

  // ==============================
  //  أمر: غير مسموح @شخص
  // ==============================
  if (msg.startsWith("غير مسموح") && message.mentions.users.size > 0) {
    if (!isOwner(userId)) return;
    const target = message.mentions.users.first();
    if (target.id !== OWNER_ID) allowedUsers.delete(target.id);
    await message.reply({ embeds: [fancy("🚫 تم المنع", `<@${target.id}> لم يعد مسموح له!`, 0xe74c3c)] });
    return;
  }

  // ==============================
  //  أوامر الفعليات (تشتغل فقط في روم الفعليات)
  // ==============================
  if (eventChannelId && channel.id === eventChannelId) {
    // تحقق أن لديه رتبة الفعليات أو هو الملك
    const hasRole = eventRoleId ? member.roles.cache.has(eventRoleId) : false;
    if (!hasRole && !isOwner(userId)) {
      // تجاهل
    } else {

      // ===== روليت =====
      if (msg === "-روليت") {
        return startRouletteGame(message, guild, channel);
      }

      // ===== الوان =====
      if (msg === "-الوان") {
        return startColorsGame(message, channel, userId);
      }

      // ===== زر =====
      if (msg === "-زر") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`zr_${userId}_${Date.now()}`).setLabel("🔴 اضغط!").setStyle(ButtonStyle.Danger)
        );
        const delay = Math.floor(Math.random() * 5000) + 1000;
        const embed = fancy("🔴 لعبة الزر", "⏳ انتظر... لا تضغط قبل الإشارة!", 0xe74c3c);
        const m = await channel.send({ embeds: [embed], components: [row] });

        setTimeout(async () => {
          const go = fancy("🟢 الآن!", "**اضغط الآن!!** من يضغط أول يفوز! ⚡", 0x2ecc71);
          await m.edit({ embeds: [go], components: [row] }).catch(() => {});
        }, delay);
        return;
      }

      // ===== نرد =====
      if (msg === "-نرد") {
        const d1 = Math.ceil(Math.random() * 6);
        const d2 = Math.ceil(Math.random() * 6);
        const dice = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
        await channel.send({
          embeds: [fancy("🎲 النرد", `${dice[d1 - 1]} + ${dice[d2 - 1]} = **${d1 + d2}**`, 0xf39c12)]
        });
        return;
      }

      // ===== xo =====
      if (msg === "-xo" || msg === "-hotxo") {
        return startXOGame(message, channel, userId, msg === "-hotxo");
      }

      // ===== حجرة ورقة مقص =====
      if (msg === "-حجرة") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("hjra_rock").setLabel("🪨 حجرة").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("hjra_paper").setLabel("📄 ورقة").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("hjra_scissors").setLabel("✂️ مقص").setStyle(ButtonStyle.Danger)
        );
        await channel.send({
          embeds: [fancy("🪨 حجرة ورقة مقص", `<@${userId}> اختر سلاحك!`, 0x3498db)],
          components: [row]
        });
        return;
      }

      // ===== عجلة =====
      if (msg === "-عجلة") {
        const members = guild.members.cache.filter(m => !m.user.bot && m.voice?.channelId);
        const list = members.size > 0 ? [...members.values()] : guild.members.cache.filter(m => !m.user.bot).first(10);
        const winner = [...(members.size > 0 ? members.values() : list)][Math.floor(Math.random() * (members.size || 10))];
        let i = 0;
        const names = guild.members.cache.filter(m => !m.user.bot).map(m => m.displayName).slice(0, 10);
        const spin = setInterval(async () => {
          const current = names[i % names.length];
          await channel.send({ embeds: [fancy("🎡 العجلة تدور...", `**${current}**`, 0x9b59b6)] }).catch(() => {});
          i++;
          if (i >= 15) {
            clearInterval(spin);
            await channel.send({ embeds: [fancy("🏆 الفائز!", `🎉 <@${winner?.id || userId}> فاز بالعجلة!`, 0xf1c40f)] });
            getPlayer(winner?.id || userId).points += 1;
          }
        }, 300);
        return;
      }

      // ===== خمن =====
      if (msg === "-خمن") {
        const num = Math.floor(Math.random() * 100) + 1;
        await channel.send({ embeds: [fancy("🔢 خمن الرقم", "خمن رقم من 1 إلى 100!\nلديك 5 محاولات!", 0x3498db)] });
        let tries = 0;
        const filter = m => !m.author.bot && !isNaN(m.content);
        const collector = channel.createMessageCollector({ filter, time: 60000 });
        collector.on("collect", async m => {
          tries++;
          const guess = parseInt(m.content);
          if (guess === num) {
            await channel.send({ embeds: [fancy("🎉 صح!", `<@${m.author.id}> خمن الرقم **${num}** بـ ${tries} محاولة! +1 نقطة`, 0x2ecc71)] });
            getPlayer(m.author.id).points += 1;
            collector.stop();
          } else if (tries >= 5) {
            await channel.send({ embeds: [fancy("😔 انتهت المحاولات", `الرقم كان **${num}**`, 0xe74c3c)] });
            collector.stop();
          } else {
            await m.reply(guess < num ? "📈 أكبر!" : "📉 أصغر!");
          }
        });
        return;
      }

      // ===== ايموجي =====
      if (msg === "-ايموجي") {
        const emojis = ["😀", "🎉", "🔥", "⚡", "🌙", "🎮", "🏆", "💎", "🎲", "🌟"];
        const target = emojis[Math.floor(Math.random() * emojis.length)];
        const shuffled = [...emojis].sort(() => Math.random() - 0.5).slice(0, 5);
        if (!shuffled.includes(target)) shuffled[0] = target;
        shuffled.sort(() => Math.random() - 0.5);

        const row = new ActionRowBuilder().addComponents(
          shuffled.map(e => new ButtonBuilder().setCustomId(`emoji_${e}_${userId}`).setLabel(e).setStyle(ButtonStyle.Secondary))
        );
        await channel.send({
          embeds: [fancy("😀 لعبة الإيموجي", `ابحث عن: **${target}**\nاضغط على الإيموجي الصحيح!`, 0xf39c12)],
          components: [row]
        });
        return;
      }

      // ===== مافيا (بسيطة) =====
      if (msg === "-مافيا") {
        await channel.send({
          embeds: [fancy("🕵️ المافيا", "لعبة المافيا!\n\nاضغط للانضمام (30 ثانية):", 0x2c3e50)],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("mafia_join").setLabel("✋ انضم").setStyle(ButtonStyle.Success)
          )]
        });
        return;
      }

      // ===== كراسي =====
      if (msg === "-كراسي") {
        await channel.send({
          embeds: [fancy("🪑 الكراسي الموسيقية", "لعبة الكراسي! اضغط للانضمام (30 ثانية):", 0xe67e22)],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("chairs_join").setLabel("✋ انضم").setStyle(ButtonStyle.Success)
          )]
        });
        return;
      }

      // ===== ريبلكا =====
      if (msg === "-ريبلكا") {
        const words = ["تفاحة", "سيارة", "بحر", "جبل", "نجمة", "قمر", "شمس", "زهرة", "كتاب", "مدينة"];
        const word = words[Math.floor(Math.random() * words.length)];
        await channel.send({ embeds: [fancy("🎭 ريبلكا", `الكلمة الخفية: ||**${word}**||\nاوصف الكلمة بدون ذكرها! الباقون يخمنون!`, 0x8e44ad)] });
        return;
      }

      // ===== أسرع =====
      if (msg === "-اسرع") {
        const letters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        const letter = letters[Math.floor(Math.random() * letters.length)];
        const categories = ["اسم", "حيوان", "دولة", "فاكهة", "مهنة"];
        await channel.send({
          embeds: [fancy("⚡ أسرع!", `الحرف: **${letter}**\nاكتب ${categories.map(c => `**${c}**`).join("، ")} تبدأ بحرف **${letter}**!\nأسرع شخص يفوز!`, 0xf39c12)]
        });
        return;
      }

    }
  }

  // ==============================
  //  أوامر الزواج (في أي مكان)
  // ==============================
  if (msg.startsWith("زواج") && message.mentions.users.size > 0) {
    const target = message.mentions.users.first();
    if (marriages[userId]) return message.reply({ embeds: [fancy("💍", "أنت متزوج بالفعل! طلق أولاً.", 0xe74c3c)] });
    if (marriages[target.id]) return message.reply({ embeds: [fancy("💍", `${target.username} متزوج بالفعل!`, 0xe74c3c)] });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_marry_${userId}_${target.id}`).setLabel("✅ قبول").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_marry_${userId}_${target.id}`).setLabel("❌ رفض").setStyle(ButtonStyle.Danger)
    );
    await channel.send({
      content: `<@${target.id}>`,
      embeds: [fancy("💍 طلب زواج", `<@${userId}> يطلب الزواج من <@${target.id}>!\nهل توافق؟`, 0xff69b4)],
      components: [row]
    });
    return;
  }

  if (msg === "طلاق") {
    if (!marriages[userId]) return message.reply({ embeds: [fancy("💔", "لست متزوجاً!", 0xe74c3c)] });
    const partner = marriages[userId];
    delete marriages[userId];
    delete marriages[partner];
    await message.reply({ embeds: [fancy("💔 طلاق", `تم الطلاق من <@${partner}>`, 0xe74c3c)] });
    return;
  }

  if (msg === "زوجي" || msg === "زوجتي") {
    if (!marriages[userId]) return message.reply({ embeds: [fancy("💍", "لست متزوجاً!", 0xe74c3c)] });
    await message.reply({ embeds: [fancy("💑 شريك الحياة", `شريكك: <@${marriages[userId]}>`, 0xff69b4)] });
    return;
  }

  if (msg === "زواجات") {
    const list = Object.entries(marriages).filter(([a]) => !marriages[marriages[a]] || a < marriages[a]).map(([a, b]) => `💑 <@${a}> ❤️ <@${b}>`).join("\n");
    await message.reply({ embeds: [fancy("💒 قائمة المتزوجين", list || "لا يوجد متزوجون!", 0xff69b4)] });
    return;
  }

});

// ============================
//  معالج الأزرار
// ============================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
  const { customId, user, guild, channel } = interaction;

  // ===== فتح تذكرة =====
  if (customId === "open_ticket") {
    await interaction.deferReply({ ephemeral: true });
    const select = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`ticket_reason_${user.id}`).setPlaceholder("اختر سبب فتح التذكرة").addOptions([
        { label: "🆘 مشكلة تقنية", value: "technical" },
        { label: "💰 مشكلة في البنك", value: "bank" },
        { label: "⚔️ شكوى ضد عضو", value: "report" },
        { label: "💡 اقتراح", value: "suggestion" },
        { label: "❓ استفسار", value: "other" },
      ])
    );
    await interaction.editReply({ embeds: [fancy("🎫 فتح تذكرة", "اختر سبب فتح التذكرة:")], components: [select] });
    return;
  }

  // ===== سبب التذكرة =====
  if (customId.startsWith("ticket_reason_") && interaction.isStringSelectMenu()) {
    await interaction.deferReply({ ephemeral: true });
    const reason = interaction.values[0];
    const reasonText = { technical: "مشكلة تقنية", bank: "مشكلة بنك", report: "شكوى", suggestion: "اقتراح", other: "استفسار" }[reason];

    const ticketChannel = await guild.channels.create({
      name: `تذكرة-${user.username}`,
      type: ChannelType.GuildText,
      parent: ticketCategoryId || null,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...(ticketRoleId ? [{ id: ticketRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
        { id: OWNER_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ]
    }).catch(() => null);

    if (!ticketChannel) return interaction.editReply({ content: "❌ فشل إنشاء التذكرة!" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_mention_${ticketChannel.id}`).setLabel("📢 منشن مسؤول").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket_escalate_${ticketChannel.id}`).setLabel("⬆️ رفع للأونر").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_claim_${ticketChannel.id}`).setLabel("✋ استلام التذكرة").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_close_${ticketChannel.id}`).setLabel("🔒 قفل").setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `<@${user.id}>`,
      embeds: [fancy("🎫 تذكرة جديدة", `**المستخدم:** <@${user.id}>\n**السبب:** ${reasonText}\n\nيرجى شرح مشكلتك وسيتم الرد عليك قريباً.`, 0x9b59b6)],
      components: [row]
    });

    await interaction.editReply({ content: `✅ تم فتح تذكرتك: <#${ticketChannel.id}>` });
    return;
  }

  // ===== أزرار التذكرة =====
  if (customId.startsWith("ticket_claim_")) {
    const isStaff = ticketRoleId && interaction.member.roles.cache.has(ticketRoleId);
    if (!isStaff && !isOwner(user.id)) return interaction.reply({ content: "🚫 للمسؤولين فقط!", ephemeral: true });
    await interaction.reply({ embeds: [fancy("✋ استلام", `<@${user.id}> استلم هذه التذكرة.`, 0x2ecc71)] });
    return;
  }

  if (customId.startsWith("ticket_close_")) {
    const isStaff = ticketRoleId && interaction.member.roles.cache.has(ticketRoleId);
    if (!isStaff && !isOwner(user.id)) return interaction.reply({ content: "🚫 للمسؤولين فقط!", ephemeral: true });
    await interaction.reply({ embeds: [fancy("🔒 قفل", "سيتم قفل التذكرة خلال 5 ثوانٍ...", 0xe74c3c)] });
    setTimeout(async () => {
      await channel.delete().catch(() => {});
    }, 5000);
    return;
  }

  if (customId.startsWith("ticket_escalate_")) {
    await interaction.reply({ content: `<@${OWNER_ID}> تم تصعيد هذه التذكرة!`, embeds: [fancy("⬆️ تصعيد", "تم إرسال تنبيه للأونر.", 0xf39c12)] });
    return;
  }

  if (customId.startsWith("ticket_mention_")) {
    const mention = ticketRoleId ? `<@&${ticketRoleId}>` : `<@${OWNER_ID}>`;
    await interaction.reply({ content: `${mention} لديك تذكرة جديدة!`, embeds: [fancy("📢 منشن", "تم منشنة المسؤول!", 0x3498db)] });
    return;
  }

  // ===== قبول/رفض الزواج =====
  if (customId.startsWith("accept_marry_")) {
    const [, , proposerId, targetId] = customId.split("_");
    if (user.id !== targetId) return interaction.reply({ content: "هذا الطلب مش لك!", ephemeral: true });
    marriages[proposerId] = targetId;
    marriages[targetId] = proposerId;
    await interaction.update({ embeds: [fancy("💍 تم الزواج!", `مبروك! <@${proposerId}> و <@${targetId}> تزوجا! 🎉`, 0xff69b4)], components: [] });
    return;
  }

  if (customId.startsWith("reject_marry_")) {
    const [, , proposerId, targetId] = customId.split("_");
    if (user.id !== targetId) return interaction.reply({ content: "هذا الطلب مش لك!", ephemeral: true });
    await interaction.update({ embeds: [fancy("💔 تم الرفض", `<@${targetId}> رفض طلب الزواج من <@${proposerId}>`, 0xe74c3c)], components: [] });
    return;
  }

  // ===== لعبة حجرة ورقة مقص =====
  if (customId.startsWith("hjra_")) {
    const choice = customId.split("_")[1];
    const botChoice = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
    const names = { rock: "🪨 حجرة", paper: "📄 ورقة", scissors: "✂️ مقص" };
    let result = "تعادل!";
    if ((choice === "rock" && botChoice === "scissors") || (choice === "paper" && botChoice === "rock") || (choice === "scissors" && botChoice === "paper")) {
      result = "🏆 فزت!";
      getPlayer(user.id).points += 1;
    } else if (choice !== botChoice) result = "😔 خسرت!";
    await interaction.update({ embeds: [fancy("🪨 النتيجة", `أنت: ${names[choice]}\nالبوت: ${names[botChoice]}\n\n**${result}**`, result.includes("فزت") ? 0x2ecc71 : result.includes("خسرت") ? 0xe74c3c : 0xf39c12)], components: [] });
    return;
  }

  // ===== لعبة الزر =====
  if (customId.startsWith("zr_")) {
    const [, ownerId] = customId.split("_");
    await interaction.update({ embeds: [fancy("⚡ الزر!", `🏆 <@${user.id}> ضغط أول! +1 نقطة`, 0x2ecc71)], components: [] });
    getPlayer(user.id).points += 1;
    return;
  }

  // ===== لعبة الإيموجي =====
  if (customId.startsWith("emoji_")) {
    const parts = customId.split("_");
    const emoji = parts[1];
    const targetEmoji = interaction.message.embeds[0]?.description?.match(/\*\*(.*?)\*\*/)?.[1];
    if (emoji === targetEmoji) {
      await interaction.update({ embeds: [fancy("✅ صح!", `<@${user.id}> وجد الإيموجي! +1 نقطة`, 0x2ecc71)], components: [] });
      getPlayer(user.id).points += 1;
    } else {
      await interaction.reply({ content: "❌ خطأ!", ephemeral: true });
    }
    return;
  }

  // ===== مافيا انضمام =====
  if (customId === "mafia_join") {
    await interaction.reply({ content: `✅ <@${user.id}> انضم للمافيا!`, ephemeral: false });
    return;
  }

  // ===== كراسي انضمام =====
  if (customId === "chairs_join") {
    await interaction.reply({ content: `✅ <@${user.id}> انضم للكراسي!`, ephemeral: false });
    return;
  }

  // ===== XO =====
  if (customId.startsWith("xo_")) {
    return handleXOButton(interaction, customId, user);
  }

  // ===== روليت =====
  if (customId === "roulette_join") {
    return handleRouletteJoin(interaction, user);
  }
  if (customId === "roulette_start") {
    return handleRouletteStart(interaction, user, channel, guild);
  }
  if (customId.startsWith("roulette_power_")) {
    return handleRoulettePower(interaction, customId, user, channel, guild);
  }
  if (customId.startsWith("roulette_kick_")) {
    return handleRouletteKick(interaction, customId, user, channel);
  }
  if (customId.startsWith("roulette_freeze_")) {
    return handleRouletteFreeze(interaction, customId, user, channel);
  }

  // ===== الوان =====
  if (customId.startsWith("color_")) {
    return handleColorButton(interaction, customId, user, channel);
  }
});

// ============================
//  لعبة XO
// ============================
function startXOGame(message, channel, userId, isHot) {
  const board = Array(9).fill(null);
  const gameId = `xo_${channel.id}`;
  activeGames[gameId] = { board, turn: userId, players: [userId, null], hot: isHot };

  const row1 = new ActionRowBuilder().addComponents(
    [0, 1, 2].map(i => new ButtonBuilder().setCustomId(`xo_${channel.id}_${i}`).setLabel("・").setStyle(ButtonStyle.Secondary))
  );
  const row2 = new ActionRowBuilder().addComponents(
    [3, 4, 5].map(i => new ButtonBuilder().setCustomId(`xo_${channel.id}_${i}`).setLabel("・").setStyle(ButtonStyle.Secondary))
  );
  const row3 = new ActionRowBuilder().addComponents(
    [6, 7, 8].map(i => new ButtonBuilder().setCustomId(`xo_${channel.id}_${i}`).setLabel("・").setStyle(ButtonStyle.Secondary))
  );

  return channel.send({
    embeds: [fancy(isHot ? "🔥 HOT XO" : "❌⭕ XO", `<@${userId}> دورك! أنت ❌\nأول شخص آخر يضغط يكون ⭕`, 0x3498db)],
    components: [row1, row2, row3]
  });
}

async function handleXOButton(interaction, customId, user) {
  const parts = customId.split("_");
  const chanId = parts[1];
  const pos = parseInt(parts[2]);
  const gameId = `xo_${chanId}`;
  const game = activeGames[gameId];
  if (!game) return interaction.reply({ content: "اللعبة انتهت!", ephemeral: true });

  // تعيين اللاعب الثاني
  if (!game.players[1] && user.id !== game.players[0]) {
    game.players[1] = user.id;
  }

  const playerIndex = game.players.indexOf(user.id);
  if (playerIndex === -1) return interaction.reply({ content: "أنت لست في هذه اللعبة!", ephemeral: true });
  if (game.turn !== user.id) return interaction.reply({ content: "ليس دورك!", ephemeral: true });
  if (game.board[pos]) return interaction.reply({ content: "هذا المكان ممتلئ!", ephemeral: true });

  game.board[pos] = playerIndex === 0 ? "X" : "O";
  game.turn = game.players[1 - playerIndex];

  const symbols = { X: "❌", O: "⭕", null: "・" };
  const styles = { X: ButtonStyle.Danger, O: ButtonStyle.Success, null: ButtonStyle.Secondary };

  const rows = [[0, 1, 2], [3, 4, 5], [6, 7, 8]].map(group =>
    new ActionRowBuilder().addComponents(
      group.map(i => new ButtonBuilder().setCustomId(`xo_${chanId}_${i}`).setLabel(symbols[game.board[i]]).setStyle(styles[game.board[i]]).setDisabled(!!game.board[i]))
    )
  );

  const winner = checkXOWinner(game.board);
  if (winner) {
    const winnerId = game.players[winner === "X" ? 0 : 1];
    delete activeGames[gameId];
    getPlayer(winnerId).points += 1;
    return interaction.update({
      embeds: [fancy("🏆 انتهت اللعبة!", `<@${winnerId}> فاز! ${winner === "X" ? "❌" : "⭕"} +1 نقطة`, 0xf1c40f)],
      components: rows.map(r => { r.components.forEach(b => b.setDisabled(true)); return r; })
    });
  }

  if (game.board.every(Boolean)) {
    delete activeGames[gameId];
    return interaction.update({ embeds: [fancy("🤝 تعادل!", "انتهت اللعبة بتعادل!", 0xf39c12)], components: rows.map(r => { r.components.forEach(b => b.setDisabled(true)); return r; }) });
  }

  return interaction.update({
    embeds: [fancy("❌⭕ XO", `دور <@${game.turn}>`, 0x3498db)],
    components: rows
  });
}

function checkXOWinner(board) {
  const wins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

// ============================
//  لعبة الروليت
// ============================
function startRouletteGame(message, guild, channel) {
  const gameId = `roulette_${channel.id}`;
  activeGames[gameId] = { players: [message.author.id], started: false, currentTurn: 0, eliminated: [] };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("roulette_join").setLabel("✅ دخول").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("roulette_start").setLabel("▶️ ابدأ").setStyle(ButtonStyle.Primary)
  );

  return channel.send({
    content: `@everyone`,
    embeds: [fancy("🎡 روليت!", `<@${message.author.id}> فتح روليت!\n\n**اللاعبون:**\n• <@${message.author.id}>\n\nاضغط **دخول** للانضمام أو **ابدأ** للبدء!`, 0x9b59b6)],
    components: [row]
  });
}

function handleRouletteJoin(interaction, user) {
  const gameId = `roulette_${interaction.channel.id}`;
  const game = activeGames[gameId];
  if (!game) return interaction.reply({ content: "لا يوجد روليت!", ephemeral: true });
  if (game.players.includes(user.id)) return interaction.reply({ content: "أنت بالفعل في اللعبة!", ephemeral: true });
  game.players.push(user.id);

  const playersList = game.players.map(p => `• <@${p}>`).join("\n");
  return interaction.update({
    embeds: [fancy("🎡 روليت!", `**اللاعبون (${game.players.length}):**\n${playersList}`, 0x9b59b6)],
    components: interaction.message.components
  });
}

async function handleRouletteStart(interaction, user, channel, guild) {
  const gameId = `roulette_${channel.id}`;
  const game = activeGames[gameId];
  if (!game || game.players[0] !== user.id) return interaction.reply({ content: "فقط صاحب اللعبة يبدأ!", ephemeral: true });
  if (game.players.length < 2) return interaction.reply({ content: "تحتاج لاعبين على الأقل!", ephemeral: true });
  game.started = true;

  // اعرض صورة GIF متحركة (نص بديل عن GIF حقيقي)
  await interaction.update({ embeds: [fancy("🎡 الروليت تدور...", "⚡ تدور... تدور... تدور...\n\n🌀 🌀 🌀 🌀 🌀", 0xf39c12)], components: [] });

  // محاكاة دوران
  let spins = 0;
  const spinInterval = setInterval(async () => {
    const random = game.players[Math.floor(Math.random() * game.players.length)];
    await channel.send({ embeds: [fancy("🎡", `⚡ **<@${random}>**...`, 0xf39c12)] }).then(m => setTimeout(() => m.delete().catch(() => {}), 800));
    spins++;
    if (spins >= 8) {
      clearInterval(spinInterval);
      // اختر ضحية
      const victim = game.players[Math.floor(Math.random() * game.players.length)];

      const row = new ActionRowBuilder().addComponents(
        game.players.filter(p => p !== victim).map((p, i) =>
          new ButtonBuilder().setCustomId(`roulette_kick_${victim}_${p}`).setLabel(`طرد ${i + 1}`).setStyle(ButtonStyle.Danger)
        )
      );
      const powerRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`roulette_power_bomb_${victim}`).setLabel("💣 قنبلة (10نق)").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`roulette_power_freeze_${victim}`).setLabel("❄️ تجميد (15نق)").setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [fancy("🎯 عليك!", `<@${victim}> الروليت وقفت عليك!\n\nاختر شخصاً تطرده من القائمة أدناه:\n\n**لديك قوى خاصة أيضاً:**\n💣 قنبلة = تضر 3 لاعبين (10 نقاط)\n❄️ تجميد = تجمد لاعباً جولتين (15 نقطة)`, 0xe74c3c)],
        components: game.players.filter(p => p !== victim).length > 0 ? [row, powerRow] : [powerRow]
      });
    }
  }, 400);
}

async function handleRouletteKick(interaction, customId, user, channel) {
  const [, , victimId, targetId] = customId.split("_");
  if (user.id !== victimId) return interaction.reply({ content: "ليس دورك!", ephemeral: true });

  const gameId = `roulette_${channel.id}`;
  const game = activeGames[gameId];
  if (!game) return;

  game.players = game.players.filter(p => p !== targetId);
  game.eliminated.push(targetId);

  await interaction.update({
    embeds: [fancy("💥 طُرد!", `<@${targetId}> تم طرده من الروليت!\n\n**اللاعبون المتبقون:** ${game.players.map(p => `<@${p}>`).join(", ")}`, 0xe74c3c)],
    components: []
  });

  if (game.players.length === 1) {
    getPlayer(game.players[0]).points += 3;
    await channel.send({ embeds: [fancy("🏆 الفائز!", `🎉 <@${game.players[0]}> فاز بالروليت! +3 نقاط!`, 0xf1c40f)] });
    delete activeGames[gameId];
  }
}

async function handleRoulettePower(interaction, customId, user, channel, guild) {
  const parts = customId.split("_");
  const power = parts[2]; // bomb or freeze
  const victimId = parts[3];
  if (user.id !== victimId) return interaction.reply({ content: "ليس دورك!", ephemeral: true });

  const gameId = `roulette_${channel.id}`;
  const game = activeGames[gameId];
  const player = getPlayer(user.id);

  if (power === "bomb") {
    if (player.points < 10) return interaction.reply({ content: "❌ ليس لديك نقاط كافية! (تحتاج 10)", ephemeral: true });
    player.points -= 10;
    // ضرر للاعبين عشوائيين
    const targets = [...game.players].filter(p => p !== user.id).sort(() => Math.random() - 0.5).slice(0, 3);
    game.players = game.players.filter(p => !targets.includes(p));
    game.eliminated.push(...targets);

    await interaction.update({
      embeds: [fancy("💣 انفجار!", `<@${user.id}> استخدم القنبلة!\n💥 تم طرد: ${targets.map(p => `<@${p}>`).join(", ")}`, 0xe74c3c)],
      components: []
    });
  }

  if (power === "freeze") {
    if (player.points < 15) return interaction.reply({ content: "❌ ليس لديك نقاط كافية! (تحتاج 15)", ephemeral: true });

    const others = game.players.filter(p => p !== user.id);
    if (others.length === 0) return interaction.reply({ content: "لا يوجد لاعبون آخرون!", ephemeral: true });

    const freezeRow = new ActionRowBuilder().addComponents(
      others.slice(0, 5).map((p, i) =>
        new ButtonBuilder().setCustomId(`roulette_freeze_${p}_${user.id}`).setLabel(`تجميد ${i + 1}`).setStyle(ButtonStyle.Primary)
      )
    );
    await interaction.update({
      embeds: [fancy("❄️ تجميد", `<@${user.id}> من تريد تجميده؟`, 0x3498db)],
      components: [freezeRow]
    });
  }
}

async function handleRouletteFreeze(interaction, customId, user, channel) {
  const [, , targetId, ownerId] = customId.split("_");
  if (user.id !== ownerId) return interaction.reply({ content: "ليس لك!", ephemeral: true });

  getPlayer(user.id).points -= 15;
  const target = getPlayer(targetId);
  target.frozen = true;
  target.frozenRounds = 2;

  await interaction.update({
    embeds: [fancy("❄️ تجميد!", `<@${targetId}> تم تجميده لجولتين!\nلن يستطيع اللعب في دوره القادم.`, 0x3498db)],
    components: []
  });
}

// ============================
//  لعبة الألوان
// ============================
function startColorsGame(message, channel, userId) {
  const colors = ["🟡", "🟣", "🟤", "🔵", "🔴"];
  const colorNames = { "🟡": "أصفر", "🟣": "بنفسجي", "🟤": "بني", "🔵": "أزرق", "🔴": "أحمر" };
  const size = 19 + Math.floor(Math.random() * 3); // 19-21 محاولة
  const targetColor = colors[Math.floor(Math.random() * colors.length)];

  // إنشاء لوحة عشوائية
  const board = Array(100).fill(null).map(() => colors[Math.floor(Math.random() * colors.length)]);

  const gameId = `color_${channel.id}`;
  activeGames[gameId] = { board, target: targetColor, attempts: 0, maxAttempts: size, player: userId, bet: 100 };

  const boardDisplay = Array(10).fill(null).map((_, row) =>
    board.slice(row * 10, row * 10 + 10).join("")
  ).join("\n");

  const row = new ActionRowBuilder().addComponents(
    colors.map(c => new ButtonBuilder().setCustomId(`color_${channel.id}_${c}`).setLabel(colorNames[c]).setStyle(ButtonStyle.Secondary).setEmoji(c))
  );

  return channel.send({
    embeds: [fancy("🎨 لعبة الألوان", `اجعل **كل اللوحة** باللون **${targetColor} ${colorNames[targetColor]}**!\n\nعدد المحاولات المتاحة: **${size}**\n\n${boardDisplay}`, 0x9b59b6)],
    components: [row]
  });
}

async function handleColorButton(interaction, customId, user, channel) {
  const parts = customId.split("_");
  const chanId = parts[1];
  const chosen = parts[2];
  const gameId = `color_${chanId}`;
  const game = activeGames[gameId];

  if (!game) return interaction.reply({ content: "اللعبة انتهت!", ephemeral: true });
  if (game.player !== user.id) return interaction.reply({ content: "هذه ليست لعبتك!", ephemeral: true });

  game.attempts++;
  // تغيير اللون (flood fill مبسط - غير اللون الأكثر شيوعاً)
  const colors = ["🟡", "🟣", "🟤", "🔵", "🔴"];
  game.board = game.board.map(c => c === game.board[0] ? chosen : c);

  const allSame = game.board.every(c => c === game.target);
  const boardDisplay = Array(10).fill(null).map((_, row) => game.board.slice(row * 10, row * 10 + 10).join("")).join("\n");

  if (allSame) {
    const reward = game.bet * 3;
    getPlayer(user.id).points += Math.floor(reward / 10);
    delete activeGames[gameId];
    return interaction.update({
      embeds: [fancy("🎉 فزت!", `رائع! أكملت اللوحة بـ ${game.attempts} محاولة!\n+${Math.floor(reward / 10)} نقاط`, 0xf1c40f)],
      components: []
    });
  }

  if (game.attempts >= game.maxAttempts) {
    delete activeGames[gameId];
    return interaction.update({
      embeds: [fancy("😔 خسرت!", `نفدت المحاولات! اللوحة لم تكتمل.\n\n${boardDisplay}`, 0xe74c3c)],
      components: []
    });
  }

  const colorNames = { "🟡": "أصفر", "🟣": "بنفسجي", "🟤": "بني", "🔵": "أزرق", "🔴": "أحمر" };
  const row = new ActionRowBuilder().addComponents(
    colors.map(c => new ButtonBuilder().setCustomId(`color_${chanId}_${c}`).setLabel(colorNames[c]).setStyle(ButtonStyle.Secondary).setEmoji(c))
  );

  return interaction.update({
    embeds: [fancy("🎨 الألوان", `المحاولات: ${game.attempts}/${game.maxAttempts}\nالهدف: ${game.target}\n\n${boardDisplay}`, 0x9b59b6)],
    components: [row]
  });
}

// ============================
//  تشغيل البوت
// ============================
if (!TOKEN) {
  console.error("❌ لم يتم ضبط DISCORD_TOKEN في متغيرات البيئة!");
  process.exit(1);
}

client.login(TOKEN);
