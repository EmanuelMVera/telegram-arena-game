import { Telegraf, Markup } from "telegraf";
import "dotenv/config";

const BOT_TOKEN = process.env.BOT_TOKEN;
const GAME_URL = process.env.GAME_URL;

if (!BOT_TOKEN) {
  throw new Error("Falta BOT_TOKEN en variables de entorno");
}

if (!GAME_URL) {
  throw new Error("Falta GAME_URL en variables de entorno");
}

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "Tocá el botón para jugar:",
    Markup.inlineKeyboard([Markup.button.webApp("Jugar", GAME_URL)]),
  );
});

bot.command("jugar", (ctx) => {
  ctx.reply(
    "Abrí el juego desde acá:",
    Markup.inlineKeyboard([Markup.button.webApp("Jugar", GAME_URL)]),
  );
});

bot.launch();

console.log("Bot iniciado");
