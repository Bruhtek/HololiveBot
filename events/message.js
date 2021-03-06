const { WebhookClient } = require('discord.js');
const ratelimit = new Set();
const messageRatelimit = new Set();

const mongoose = require('mongoose');
var Int32 = require('mongoose-int32');
const guildUserSchema = require.main.require('./schemes/guildUserSchema.js')
const GuildUser = mongoose.model('guildUser', guildUserSchema, 'guildUser')
const lastMessageSchema = require.main.require('./schemes/lastMessageSchema.js')
const LastMessage = mongoose.model('lastMessage', lastMessageSchema, 'lastMessage')

async function createGuildUser(id, totalXP, level, xp, guildId) {
  return new GuildUser({
    id,
    totalXP,
    level,
    xp,
    guildId,
  }).save()
}

async function createLastMessage(userID) {
  return new LastMessage({
    userID: userID,
    date: Date.now()
  }).save();
}

async function findGuildUser(id, guildId) {
  return await GuildUser.findOne({ id: id, guildId: guildId })
}

module.exports = async (client, message) => {
  if (message.author.bot) return;

  const user = await client.getUser(message);
  message.user = user;

  //leveling
  if(message.guild && !messageRatelimit.has(message.guild.id  + "" + message.author.id)) {
    let user = await client.connector.then(async () => {
      return findGuildUser(message.author.id, message.guild.id)
    })
    
    if (!user) {
      user = await createGuildUser(message.author.id, 0, 0, 0, message.guild.id)
    }

    var xp = 15 + Math.round(Math.random() * 10) + message.user.xpadd;
    if(message.user.xpmulti != 0) {
      xp = xp * message.user.xpmulti;
    }
    var userXp = user.xp + xp;
    user.totalXP = user.totalXP + xp;

    if(userXp > 5 * (Math.pow(user.level,2)) + (50 * user.level) + 100) {
      user.level++;
      user.xp = Math.max(userXp - (5 * (Math.pow(user.level,2)) + (50 * user.level) + 100), 0);
    } else {
      user.xp = userXp;
    }

    user.save();

    var timeout = client.config.messageLevelRatelimit;
    messageRatelimit.add(message.guild.id  + ""  + message.author.id);
    setTimeout(() => {
      messageRatelimit.delete(message.guild.id  + ""  + message.author.id);
    }, timeout)
  }

  const settings = message.settings = client.getSettings(message.guild);

  // Checks if the bot was mentioned, with no message after it, returns the prefix.
  const prefixMention = new RegExp(`^<@!?${client.user.id}>( |)$`);
  if (message.content.match(prefixMention)) {
    return message.reply(`My prefix on this guild is \`${client.settings.prefix}\``);
  }

  //#region Basically commands
  if(message.content.startsWith(`I'm `) && message.content.length > 4) {
    const link = "https://cdn.myanimelist.net/r/360x360/images/characters/12/413065.jpg?s=c9020da943303fdb7f40c4b2ab383bbb";
    const nick = `Marine "Senchou" Houshou`;
    message.guild.channels.cache
        .find(channel => channel.id === message.channel.id)
        .createWebhook(nick, {
          avatar: link
        }).catch(console.log)
        .then(async webhook => {
            await webhook.send(`Hi ${message.content.slice(4)}`);
            await webhook.send("I'm HORNY!!!");
            webhook.delete();
        }).catch(e => client.logger.error(e));
  }

  if((message.content.startsWith('b') || message.content.startsWith('B')) && message.author.id == "397420846781693953") {
    message.react("🇦");
  }

  if(message.channel.parent) {
    if(message.channel.parent.id == "786153273186975765" && !message.member.roles.cache.has("785422260063698974") && message.author.id != "353930309886279682") {
      message.delete();
      return;
    }
  }
  //#endregion

  //#region Last Message Checking
  if(message.channel.id == client.config.monitorChannelID) {
    let lastMessage = await client.connector.then(async () => {
      return await LastMessage.findOne({ userID: message.author.id });
    })

    if (!lastMessage) {
      lastMessage = await createLastMessage(message.author.id)
    } 

    lastMessage.date = Date.now();
    lastMessage.save();
  }
  //#endregion

  // Also good practice to ignore any message that does not start with our prefix,
  // which is set in the configuration file.
  if (message.content.toLowerCase().indexOf(client.settings.prefix) !== 0) return;

  // Here we separate our "command" name, and our "arguments" for the command.
  // e.g. if we have the message "+say Is this the real life?" , we'll get the following:
  // command = say
  // args = ["Is", "this", "the", "real", "life?"]
  const args = message.content.slice(client.settings.prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  // If the member on a guild is invisible or not cached, fetch them.
  if (message.guild && !message.member) await message.guild.fetchMember(message.author);

  // Get the user or member's permission level from the elevation
  const level = client.permlevel(message);

  // Check whether the command, or alias, exist in the collections defined
  // in app.js.
  const cmd = client.commands.get(command) || client.commands.get(client.aliases.get(command));
  // using this const varName = thing OR otherthign; is a pretty efficient
  // and clean way to grab one of 2 values!
  if (!cmd) return;

  if(cmd.conf.perk) {
    if(!user.perks.includes(cmd.conf.perk)) {;
      return;
    }
  }

  // Some commands may not be useable in DMs. This check prevents those commands from running
  // and return a friendly error message.
  if (cmd && !message.guild && cmd.conf.guildOnly)
    return message.channel.send("This command is unavailable via private message. Please run this command in a guild.");

  if(cmd && !cmd.conf.enabled) {
    return message.channel.send("This command is currently disabled!");
  }

  if (level < client.levelCache[cmd.conf.permLevel]) {
    if (client.settings.systemNotice === "true") {
      if(cmd.conf.logCommand) {
        client.logger.warn(`[WARN] ${client.config.permLevels.find(l => l.level === level).name} ${message.author.username} tried to run ${cmd.help.name} which requires ${client.levelCache[cmd.conf.permLevel]} (${cmd.conf.permLevel})`);
      }
      return message.channel.send(`You do not have permission to use this command. Your permission level is ${level} (${client.config.permLevels.find(l => l.level === level).name}) This command requires level ${client.levelCache[cmd.conf.permLevel]} (${cmd.conf.permLevel})`);
    } else {
      return;
    }
  } 

  // To simplify message arguments, the author's level is now put on level (not member so it is supported in DMs)
  // The "level" command module argument will be deprecated in the future.
  message.author.permLevel = level;
  
  message.flags = [];
  while (args[0] && args[0][0] === "-") {
    message.flags.push(args.shift().slice(1));
  }
  // If the command exists, **AND** the user has permission, run it.
  if(cmd.conf.logCommand) {
    client.logger.cmd(`[CMD] ${client.config.permLevels.find(l => l.level === level).name} ${message.author.username} (${message.author.id}) ran command ${cmd.help.name}`);
  }

  if (ratelimit.has(message.author.id + cmd.help.name) && level < 8) {
    message.channel.send("You're too fast! Wait a bit! (Ratelimited)");
  } else {
    cmd.run(client, message, args, level);
    var timeout = cmd.conf.ratelimit != undefined ? cmd.conf.ratelimit : client.config.ratelimit;
    ratelimit.add(message.author.id + cmd.help.name);
    setTimeout(() => {
      ratelimit.delete(message.author.id + cmd.help.name);
    }, timeout)
  }
  
};