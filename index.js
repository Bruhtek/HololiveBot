const Discord = require("discord.js");
const { promisify } = require("util");
const readdir = promisify(require("fs").readdir);
const readdirp = require('readdirp');
const Enmap = require("enmap");
require('dotenv').config()

const client = new Discord.Client({ disableMentions: 'everyone' });

const keepAlive = require('./server');
client.config = require("./config.js");


client.logger = require("./modules/Logger");
require("./modules/functions.js")(client);

client.commands = new Enmap();
client.aliases = new Enmap();

client.settings = client.config.defaultSettings;

const init = async () => {

  const cmdFiles = await readdirp.promise("./commands/", {fileFilter: '*.js'});
  console.log(cmdFiles);
  client.logger.log(`Loading a total of ${cmdFiles.length} commands.`);
  cmdFiles.forEach(f => {
    if (!f.path.endsWith(".js")) return;
    const response = client.loadCommand(f.path);
    if (response) console.log(response);
  });

  const evtFiles = await readdir("./events/");
  client.logger.log(`Loading a total of ${evtFiles.length} events.`);
  evtFiles.forEach(file => {
    const eventName = file.split(".")[0];
    client.logger.log(`Loading Event: ${eventName}`);
    const event = require(`./events/${file}`);
    client.on(eventName, event.bind(null, client));
  });

  client.levelCache = {};
  for (let i = 0; i < client.config.permLevels.length; i++) {
    const thisLevel = client.config.permLevels[i];
    client.levelCache[thisLevel.name] = thisLevel.level;
  }

  keepAlive();
  client.login(process.env.TOKEN);
};

init();