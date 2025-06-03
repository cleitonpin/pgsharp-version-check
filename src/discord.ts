import axios from "axios";

export async function sendDiscordMessage(webhookUrl: string, message: string): Promise<void> {
  try {
    const response = await axios.post(webhookUrl, {
      embeds: [
        {
          title: "Notification",
          description: message,
          color: 0x00ff00, // Green color
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