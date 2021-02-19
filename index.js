require("dotenv").config();
const Discord = require("discord.js");
const client = new Discord.Client({
  // Menggunakan intent agar bot hanya mendapatkan data yang dibutuhkan
  // https://discord.com/developers/docs/topics/gateway#gateway-intents
  ws: {
    intents: [
      "GUILDS",
      "GUILD_MEMBERS",
      "GUILD_MESSAGES",
      "GUILD_MESSAGE_REACTIONS",
    ],
  },
});

/** @type {Discord.Guild} */
let guildId;

/** @type {Discord.TextChannel} */
let channelChangeNickname;

/** @type {Discord.TextChannel} */
let channelNicknameLog;

// Dijalankan sekali (once) pada saat event "ready"
client.once("ready", async function () {
  try {
    // Mendapatkan data guild/server
    guildId = await client.guilds.fetch(process.env.GUILD_ID);
    // Mendapatkan data dari channel untuk request nickname
    channelChangeNickname = guildId.channels.cache.get(process.env.CHANNEL_CHANGE_NICKNAME);
    // Mendapatkan data dari channel untuk log request nickname
    channelNicknameLog = guildId.channels.cache.get(process.env.CHANNEL_NICKNAME_LOG);

    // Print informasi ke konsol untuk memastikan bahwa bot telah online
    console.info(`I am ready! | ${client.user.username}`);
  } catch (error) {
    console.error(error);
  }
});

// Dijalankan setiap ada pesan baru
client.on("message", async function (message) {
  // Chat tidak diproses apabila berasal dari bot
  if (message.author.bot) {
    return;
  }

  // Chat tidak diproses apabila prefix yang diatur tidak terdeteksi
  if (message.content.indexOf(process.env.PREFIX) !== 0) {
    return;
  }

  // Memisahkan arguments dengan command
  const args = message.content.slice(1).trim().split(/ +/g);
  // Mendapatkan command yang diberikan
  const command = args.shift().toLowerCase();

  if (
    command === "nick"
    && message.channel.id === process.env.CHANNEL_CHANGE_NICKNAME
  ) {
    // Menyatukan arguments yang sebelumnya dipisah menjadi array
    // Digunakan apabila ada user yang menggunakan spasi untuk nickname yang baru
    const joinArgs = args.join(" ");

    // Membuat embed nickname request
    const embedChangeNickname = new Discord.MessageEmbed()
      .setColor(16776960)
      .setTitle("Nickname Request!")
      .addField("User", `${message.author.username}#${message.author.discriminator}`)
      .addField("User ID", message.author.id)
      .addField("Nickname", joinArgs)
      .setTimestamp();

    // Mengirim embed nickname request ke log channel request nickname
    const nicknameRequestMessage = await channelNicknameLog.send(embedChangeNickname);
    // Bot memberikan react centang (✅)
    await nicknameRequestMessage.react("\u2705");
    // Bot memberikan react tanda silang (❌)
    await nicknameRequestMessage.react("\u274c");

    // Mengirim pesan ke channel request nickname bahwa nickname request telah dikirimkan
    message.channel.send(`<@!${message.author.id}> \u2705 Your nickname request has successfully submitted.`);
  }
});

// Dijalankan setiap ada react baru
client.on("messageReactionAdd", async function (messageReaction, user) {
  // Bot tidak dihiraukan apabila melakukan react
  if (user.bot) {
    return;
  }

  // Jika react berasal dari log channel nickname request maka
  if (messageReaction.message.channel.id === process.env.CHANNEL_NICKNAME_LOG) {
    // Cek apakah user memiliki roles yang disetujui
    const checkUserRole = guildId.members.cache.get(user.id).roles.cache.has(process.env.ROLE_MOD);

    // Jika user memiliki roles yang disetujui
    if (checkUserRole) {
      // Mendapatkan value nickname dari embed
      const userId = messageReaction.message.embeds[0].fields[1].value;

      // Mendapatkan value user id dari embed
      const newNickname = messageReaction.message.embeds[0].fields[2].value;

      // Jika user melakukan react pada emoji centang
      if (messageReaction.emoji.name === "\u2705") {

        try {
          // Mendapatkan data dari user yang nicknamenya akan diganti
          const getUser = await guildId.members.cache.get(userId);
          // Mengganti nickname dari user yang requestnya telah disetujui
          getUser.setNickname(newNickname);

          // Mengirim pesan bahwa nickname user telah diganti
          await channelChangeNickname.send(`<@!${userId}> your nickname request is approved!`);

          // Membuat pesan embed penyetujuan nickname request ke log channel
          const embedApprovedRequest = new Discord.MessageEmbed()
            .setColor(6029056)
            .setTitle("Nickname Request Approved!")
            .addField("Nickname", messageReaction.message.embeds[0].fields[0].value)
            .addField("User ID", userId)
            .addField("Nicknane", newNickname)
            .addField("Accepted By", `${user.username}#${user.discriminator}`);
          // Mengedit pesan embed nickname request yang disetujui
          await messageReaction.message.edit(embedApprovedRequest);

          // Menghapus react dari embed di log channel
          messageReaction.message.reactions.removeAll();
        } catch (error) {
          console.error(error);
        }
      } else if (messageReaction.emoji.name === "\u274c") {
        // Mengirim pesan untuk menanyakan alasan penolakan nickname request
        const confirmDenialMessage = await messageReaction.message.channel.send(
          `<@!${user.id}>,\nPlease enter the reason for the denial.\nSay \`cancel\` to cancel the denial.`,
        );

        const filter = m => m.content.length > 0;
        messageReaction.message.channel.awaitMessages(filter, { max: 1, time: 10000, errors: ["time"] })
          .then(function (collected) {
            // Jika bukan "cancel" maka menolak nickname request
            if (collected.first().content !== "cancel") {
              // Membuat pesan embed penolakan nickname request ke log channel
              const embedDeniedRequest = new Discord.MessageEmbed()
                .setColor(16711680)
                .setTitle("Nickname Request Denied!")
                .addField("Nickname", messageReaction.message.embeds[0].fields[0].value)
                .addField("User ID", userId)
                .addField("Nicknane", newNickname)
                .addField("Denied By", `${user.username}#${user.discriminator}`)
                .addField("Reason", collected.first().content);
              // Mengedit embed nickname request yang ditolak
              messageReaction.message.edit(embedDeniedRequest);

              // Menghapus pesan yang berisi alasan penolakan/cancel
              collected.first().delete();

              // Menghapus react dari embed di log channel
              messageReaction.message.reactions.removeAll();

              // Mengirim pesan penolakan ke channel nickname request
              channelChangeNickname.send(
                `<@!${userId}> your nickname request is denied.\nReason: ${collected.first().content}`,
              );
            }

            // Menghapus chat konfirmasi penolakan nickname request
            confirmDenialMessage.delete();
          })
          .catch(function () {
            // Menghapus chat konfirmasi penolakan nickname request
            confirmDenialMessage.delete();

            // Menghapus react dari embed di log channel
            messageReaction.message.channel.send("No response.");
          });
      }
    }
  }
});

// Login ke bot
client.login();
