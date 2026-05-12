import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN!);

bot.start((ctx) => {
  ctx.reply(
    "Tocá el botón para jugar:",
    Markup.inlineKeyboard([
      Markup.button.webApp("Jugar", "https://telegram-arena-game.vercel.app"),
    ]),
  );
});

bot.launch();

console.log("Bot iniciado");
