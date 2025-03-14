require("dotenv").config();
console.log("CLIENT_ID:", process.env.REDDIT_CLIENT_ID);
console.log("CLIENT_SECRET:", process.env.REDDIT_CLIENT_SECRET);
console.log("USERNAME:", process.env.REDDIT_USERNAME);
console.log("PASSWORD:", process.env.REDDIT_PASSWORD);
console.log("USER_AGENT:", process.env.REDDIT_USER_AGENT);
console.log("WEBHOOK_URL:", process.env.POST_WEBHOOK_URL);

const Snoowrap = require("snoowrap");
const fetch = require("node-fetch");
const cron = require("node-cron");

// Configure Reddit API credentials
const reddit = new Snoowrap({
  userAgent: process.env.REDDIT_USER_AGENT,
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  username: process.env.REDDIT_USERNAME,
  password: process.env.REDDIT_PASSWORD,
});

// Your n8n webhook URL
const webhookUrl = process.env.POST_WEBHOOK_URL;

// Subreddits to monitor
const subredditsToMonitor = [
  "solar",
  "solarenergy",
  "solarDy",
  "energy",
  "renewableenergy",
  "teslasolar",
  "futurology",
  "solarpower",
  "environment",
  "diysolar",
  "renawable",
  "science",
  "teslamortors",
  "powerwall",
  "climate",
  "energystorage",
  "enphase",
  "green",
  "solarcity",
  "photovoltaics",
  "eletricvehicles",
  "sustainability",
  "teslamotors",
  "teslamodel3",
  "teslamodely",
  "selfdrivingcars",
  "teslamodels",
  "teslamodelx",
  "modely",
  "rivian",
  "electriccars",
];

// Keywords to filter for (título, corpo e flair)
const keywordsToFilter = ["solar quote", "solar quotes"];

// Track processed items to avoid duplicates
const processedItems = new Set();

// Variável para guardar o ID do intervalo de monitoramento de posts
let postMonitoringIntervalId = null;

// Function to monitor new posts (MODIFICADO - RETORNA INTERVAL ID E USA SETINTERVAL)
async function monitorPosts() {
  console.log("Starting post monitoring interval...");
  const intervalId = setInterval(async () => {
    console.log(
      `Checking for new posts in subreddits: ${subredditsToMonitor.join(
        ", "
      )}...`
    );
    try {
      for (const subreddit of subredditsToMonitor) {
        const newPosts = await reddit
          .getSubreddit(subreddit)
          .getNew({ limit: 25 });

        for (const post of newPosts) {
          if (processedItems.has(post.id)) continue;

          const postTitleLower = post.title.toLowerCase();
          const postContentLower = post.selftext
            ? post.selftext.toLowerCase()
            : "";
          const postFlairLower = post.link_flair_text
            ? post.link_flair_text.toLowerCase()
            : "";
          const containsKeywords = keywordsToFilter.some((keyword) => {
            return (
              postTitleLower.includes(keyword) ||
              postContentLower.includes(keyword) ||
              postFlairLower.includes(keyword)
            );
          });

          if (!containsKeywords) {
            console.log(
              `New post found: "${post.title}" - Does not contain keywords (title, body, or flair), ignoring.`
            );
            continue;
          }

          processedItems.add(post.id);
          console.log(
            `New post found with keywords (including flair check): ${post.title}`
          );

          await sendToWebhook({
            type: "post",
            id: post.id,
            title: post.title,
            content: post.selftext,
            author: post.author.name,
            subreddit: post.subreddit_name_prefixed.replace("r/", ""),
            url: post.url,
            permalink: `https://reddit.com${post.permalink}`,
            flair: post.link_flair_text || null,
          });
        }
      }
    } catch (error) {
      console.error("Error monitoring posts:", error);
    }
  }, 300000); // Executa a cada 5 minutos (300000ms)
  console.log("Post monitoring interval started.");
  return intervalId; // Retorna o ID do intervalo
}

// Função para parar o monitoramento
function stopMonitoring() {
  console.log("Stopping monitoring after 60 minutes...");
  if (postMonitoringIntervalId) {
    clearInterval(postMonitoringIntervalId);
    postMonitoringIntervalId = null;
    console.log("Post monitoring stopped.");
  }
  console.log("Monitoring stopped for this scheduled run.");
}

async function sendToWebhook(data) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();

    // If n8n returns a response to post as a comment
    if (responseData.resposta) {
      try {
        if (data.type === "post") {
          // Reply to post
          await reddit.getSubmission(data.id).reply(responseData.resposta);
          console.log(`Replied to post ${data.id}`);
        }
      } catch (replyError) {
        console.error("Error replying to Reddit:", replyError);
      }
    }
  } catch (error) {
    console.error("Error sending to webhook:", error);
  }
}
// Limit the size of processedItems to prevent memory issues
function cleanupProcessedItems() {
  if (processedItems.size > 1000) {
    const itemsArray = Array.from(processedItems);
    const itemsToKeep = itemsArray.slice(itemsArray.length - 500);
    processedItems.clear();
    itemsToKeep.forEach((item) => processedItems.add(item));
  }
}

// Função para configurar o agendamento diário
function setupDailySchedule() {
  console.log("Setting up daily schedule with 60-minute runs...");

  // Agendar para rodar às 9h da manhã (horário do servidor)
  cron.schedule("0 9 * * *", async () => {
    console.log("Running scheduled job at 9am for 60 minutes...");
    // Iniciar o monitoramento e guardar os IDs dos intervalos
    postMonitoringIntervalId = await monitorPosts();

    // Agendar para parar o monitoramento após 60 minutos (3600000 milissegundos)
    setTimeout(stopMonitoring, 3600000);

    console.log("Scheduled job at 9am started, will run for 60 minutes.");
  });

  // Agendar para rodar às 13h (1 da tarde) (horário do servidor)
  cron.schedule("0 13 * * *", async () => {
    console.log("Running scheduled job at 1pm for 60 minutes...");
    // Iniciar o monitoramento e guardar os IDs dos intervalos
    postMonitoringIntervalId = await monitorPosts();

    // Agendar para parar o monitoramento após 60 minutos
    setTimeout(stopMonitoring, 3600000);

    console.log("Scheduled job at 1pm started, will run for 60 minutes.");
  });

  // Agendar para rodar às 20h (8 da noite) (horário do servidor)
  cron.schedule("0 20 * * *", async () => {
    console.log("Running scheduled job at 8pm for 60 minutes...");
    // Iniciar o monitoramento e guardar os IDs dos intervalos
    postMonitoringIntervalId = await monitorPosts();

    // Agendar para parar o monitoramento após 60 minutos
    setTimeout(stopMonitoring, 3600000);

    console.log("Scheduled job at 8pm started, will run for 60 minutes.");
  });

  console.log("Daily schedule setup with 60-minute runs complete.");
}

// Função para iniciar o monitoramento (MODIFICADO - USA setupDailySchedule)
async function startMonitoring() {
  console.log("Monitoring service started...");

  // Configurar o agendamento diário (ADICIONADO - CHAMA setupDailySchedule)
  setupDailySchedule();

  console.log(
    "Monitoring will run at scheduled times (9am, 1pm, 8pm) daily for 60 minutes each."
  );
}

// Start the monitoring process
startMonitoring().catch((error) => {
  console.error("Error starting monitoring:", error);
});
