import { Telegraf, Markup } from "telegraf";
import express from "express";
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

const app = express();

app.get("/", (_req, res) => {
  res.send("Arena Brawler bot running");
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "arena-brawler-bot",
  });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server listening on port ${PORT}`);
});

process.once("SIGINT", () => {
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
});