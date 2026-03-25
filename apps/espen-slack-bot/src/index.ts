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

  // Set bot presence to "auto" so it shows with a green dot
  await app.client.users.setPresence({ presence: "auto" });

  console.log("⚡ Espen Slack Bot is running (Socket Mode)");
})();