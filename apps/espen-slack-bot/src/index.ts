import { App, LogLevel } from "@slack/bolt";
import { registerMessageListeners } from "./listeners/messages.js";
import { registerActionListeners } from "./listeners/actions.js";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

registerMessageListeners(app);
registerActionListeners(app);

(async () => {
  await app.start();
  console.log("⚡ Espen Slack Bot is running (Socket Mode)");
})();