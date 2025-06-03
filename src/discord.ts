import 'dotenv/config';
import axios from "axios";
import type { Fields } from "./interfaces/discord";

export async function sendDiscordMessage(webhookUrl: string, message: string, fields?: Fields[]): Promise<void> {
  try {
    await axios.post(webhookUrl, {
      content: `<@${process.env.DISCORD_USER_ID}>`,
    });

    const response = await axios.post(webhookUrl, {
      embeds: [
        {
          title: "PGSharp Update",
          description: message,
          color: 0x00ff00, // Green color
          fields: fields || [],
        },
      ]
    });

    if (response.status !== 204) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error sending Discord message:", error);
  }
}