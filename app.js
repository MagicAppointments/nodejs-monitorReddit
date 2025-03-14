// comment_responder_inbox_monitor.js
require("dotenv").config();

const Snoowrap = require("snoowrap");
const fetch = require("node-fetch");
const cron = require("node-cron");

// Variáveis de ambiente (carregadas do .env file)
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;
const redditUserAgent = process.env.REDDIT_USER_AGENT;
const commentWebhookUrl = process.env.COMMENT_WEBHOOK_URL; // Webhook específico para comentários e inbox

// Configuração da API do Reddit usando Snoowrap
let reddit;
try {
  console.log("Comment Responder & Inbox Monitor Script Iniciado");
  console.log("Autenticando com Reddit API...");
  reddit = new Snoowrap({
    userAgent: redditUserAgent,
    clientId: redditClientId,
    clientSecret: redditClientSecret,
    username: redditUsername,
    password: redditPassword,
  });
  console.log("Autenticado com sucesso no Reddit API.");
} catch (authError) {
  console.error("Erro ao autenticar com Reddit API:", authError);
  process.exit(1); // Encerra o script se a autenticação falhar
}

// Variável para armazenar o tempo da última execução do monitoramento (ESPECÍFICA PARA COMENTÁRIOS/INBOX)
let lastRunTimeCommentsInbox = null;

// Função para configurar o agendamento diário usando cron (ESPECÍFICA PARA COMENTÁRIOS/INBOX)
function setupDailyScheduleCommentsInbox() {
  console.log(
    "Configurando agendamento diário para Comment Responder & Inbox Monitor..."
  );
  const timezone = "America/Los_Angeles";
  const runDuration = 60 * 60 * 1000; // 60 minutos
  const scheduleTimes = ["0 9 * * *", "0 13 * * *", "0 20 * * *"]; // Horários agendados
  const intervalTime = 5 * 60 * 1000; // Intervalo de 5 minutos

  scheduleTimes.forEach((time) => {
    cron.schedule(
      time,
      async () => {
        const logTime = time.split(" ")[1];
        console.log(
          `Comment Responder & Inbox Monitor: Executando tarefa agendada às ${logTime}h por 60 minutos...`
        );

        const endTime = Date.now() + runDuration;
        console.log(
          `Comment Responder & Inbox Monitor: Tempo de término calculado: ${new Date(
            endTime
          )}`
        );

        async function runInterval() {
          if (Date.now() > endTime) {
            console.log(
              "Comment Responder & Inbox Monitor: Tempo limite atingido. Cancelando intervalo."
            );
            return;
          }
          try {
            await monitorRedditCommentsInbox(endTime); // Chama função específica para monitorar comentários e inbox
          } catch (error) {
            console.error(
              "Comment Responder & Inbox Monitor: Erro durante monitoramento e envio:",
              error
            );
          }
        }

        await runInterval();
        const intervalId = setInterval(async () => {
          await runInterval();
          if (Date.now() > endTime) {
            clearInterval(intervalId);
            console.log(
              "Comment Responder & Inbox Monitor: Intervalo cancelado devido ao tempo limite."
            );
          }
        }, intervalTime);
      },
      {
        scheduled: true,
        timezone: timezone,
      }
    );
  });
  console.log(
    "Comment Responder & Inbox Monitor: Agendamento diário configurado."
  );
}

// Função principal para monitorar comentários e inbox (ESPECÍFICA PARA COMENTÁRIOS/INBOX)
async function monitorRedditCommentsInbox(endTime) {
  console.log(
    "Comment Responder & Inbox Monitor: Iniciando monitoramento de comentários e inbox..."
  );
  const allMyComments = []; // Para armazenar TODOS os seus comentários
  const allInboxItems = []; // Para armazenar itens da inbox
  let myCommentCount = 0;
  let inboxCount = 0;
  const processedItems = new Set(); // Para rastrear itens processados nesta execução
  const now = Date.now();

  try {
    // Monitoramento de TODOS os seus Comentários Recentes
    if (Date.now() < endTime) {
      console.log(
        "Comment Responder & Inbox Monitor: Iniciando monitoramento de TODOS os seus comentários recentes..."
      );
      try {
        const myComments = await reddit.getMe().getComments({ limit: 100 }); // Busca seus comentários recentes (aumentei o limite para 100)
        for (const comment of myComments) {
          if (Date.now() > endTime) {
            console.log(
              `Comment Responder & Inbox Monitor: Tempo limite atingido durante iteração dos seus comentários. Saindo.`
            );
            break;
          }
          if (processedItems.has(comment.id)) {
            console.log(
              `Comment Responder & Inbox Monitor: Seu comentário já processado nesta execução: ${comment.id}, ignorando.`
            );
            continue;
          }

          const createdTimestamp = comment.created_utc * 1000;
          if (
            lastRunTimeCommentsInbox !== null &&
            (createdTimestamp <= lastRunTimeCommentsInbox ||
              createdTimestamp > now)
          ) {
            console.log(
              `Comment Responder & Inbox Monitor: Seu comentário "${
                comment.body
              }" fora da janela de tempo (${new Date(
                createdTimestamp
              )}), ignorando.`
            );
            continue;
          }

          processedItems.add(comment.id);
          myCommentCount++;
          console.log(
            `Comment Responder & Inbox Monitor: Seu novo comentário encontrado: ${comment.body}`
          );

          allMyComments.push({
            type: "my_comment", // Indica que é um comentário DO BOT
            id: comment.id,
            content: comment.body,
            author: comment.author.name,
            postId: comment.link_id, // Link para o post original
            postTitle: comment.link_title,
            subreddit: comment.subreddit_name_prefixed.replace("r/", ""),
            permalink: `https://reddit.com${comment.permalink}`,
          });
        }
      } catch (myCommentsError) {
        console.error(
          "Comment Responder & Inbox Monitor: Erro ao obter seus comentários recentes:",
          myCommentsError
        );
      }
    } else {
      console.log(
        "Comment Responder & Inbox Monitor: Tempo limite atingido, pulando monitoramento dos seus comentários."
      );
    }

    // Monitoramento da Inbox (MENSAGENS DIRETAS E CHAT REQUESTS) - MANTIDO
    if (Date.now() < endTime) {
      console.log(
        "Comment Responder & Inbox Monitor: Iniciando monitoramento da inbox..."
      );
      try {
        const inbox = await reddit.getInbox("unread", { limit: 25 }); // Busca mensagens não lidas da inbox
        for (const inboxItem of inbox) {
          if (Date.now() > endTime) {
            console.log(
              `Comment Responder & Inbox Monitor: Tempo limite atingido durante iteração da inbox. Saindo.`
            );
            break;
          }
          if (processedItems.has(inboxItem.id)) {
            console.log(
              `Comment Responder & Inbox Monitor: Item da inbox já processado nesta execução: ${inboxItem.id}, ignorando.`
            );
            continue;
          }

          const createdTimestamp = inboxItem.created_utc * 1000;
          if (
            lastRunTimeCommentsInbox !== null &&
            (createdTimestamp <= lastRunTimeCommentsInbox ||
              createdTimestamp > now)
          ) {
            console.log(
              `Comment Responder & Inbox Monitor: Item da inbox "${
                inboxItem.subject || inboxItem.body
              }" fora da janela de tempo (${new Date(
                createdTimestamp
              )}), ignorando.`
            );
            continue;
          }

          processedItems.add(inboxItem.id);
          inboxCount++;
          console.log(
            `Comment Responder & Inbox Monitor: Novo item na inbox encontrado: ${
              inboxItem.subject || inboxItem.body || "Sem Assunto"
            }`
          );

          allInboxItems.push({
            type: inboxItem.constructor.name, // Tipo de item (Comment, Message, etc.)
            id: inboxItem.id,
            subject: inboxItem.subject,
            body: inboxItem.body,
            author: inboxItem.author?.name,
            permalink: `https://reddit.com${inboxItem.permalink}`,
            created: new Date(inboxItem.created_utc * 1000).toISOString(),
          });

          await inboxItem.markAsRead(); // Marca a mensagem como lida após processar
        }
      } catch (inboxError) {
        console.error(
          "Comment Responder & Inbox Monitor: Erro ao obter inbox:",
          inboxError
        );
      }
    } else {
      console.log(
        "Comment Responder & Inbox Monitor: Tempo limite atingido, pulando monitoramento da inbox."
      );
    }

    // Envia todos os comentários coletados para o webhook de comentários (se houver algum)
    if (allMyComments.length > 0 || allInboxItems.length > 0) {
      console.log(
        `Comment Responder & Inbox Monitor: Enviando ${allMyComments.length} de seus comentários e ${allInboxItems.length} itens da inbox para o webhook...`
      );
      await sendCommentsInboxToWebhook([...allMyComments, ...allInboxItems]); // Envia todos os tipos de comentários e inbox items
    } else {
      console.log(
        "Comment Responder & Inbox Monitor: Nenhum comentário seu novo ou item na inbox encontrado."
      );
    }
  } catch (overallError) {
    console.error(
      "Comment Responder & Inbox Monitor: Erro geral no monitoramento:",
      overallError
    );
  }

  console.log(
    `Comment Responder & Inbox Monitor: Monitoramento de comentários e inbox concluído. Seus comentários processados: ${myCommentCount}, Inbox items processados: ${inboxCount}`
  );
  lastRunTimeCommentsInbox = now;
  console.log(
    `Comment Responder & Inbox Monitor: Tempo da última execução atualizado para: ${new Date(
      lastRunTimeCommentsInbox
    )}`
  );
}

// Função para enviar array de comentários/inbox para o webhook (REUTILIZA WEBHOOK DE COMENTÁRIOS/INBOX)
async function sendCommentsInboxToWebhook(data) {
  if (data.length === 0) {
    console.log(
      "Comment Responder & Inbox Monitor: Nenhum dado para enviar para o webhook de comentários/inbox."
    );
    return;
  }
  try {
    console.log(
      "Comment Responder & Inbox Monitor: Enviando dados para o webhook de comentários/inbox..."
    );
    const response = await fetch(commentWebhookUrl, {
      // Usa o mesmo webhook para comentários e inbox
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(
        `Comment Responder & Inbox Monitor: Erro HTTP ao enviar dados para o webhook! Status: ${response.status}`
      );
      throw new Error(
        `Comment Responder & Inbox Monitor: Erro HTTP! status: ${response.status}`
      );
    }
    console.log(
      "Comment Responder & Inbox Monitor: Dados enviados com sucesso para o webhook de comentários/inbox."
    );
  } catch (error) {
    console.error(
      "Comment Responder & Inbox Monitor: Erro ao enviar dados para webhook:",
      error
    );
  }
}

// Função principal para iniciar o serviço de monitoramento de comentários e inbox
async function startMonitoringCommentsInbox() {
  // Função de inicialização específica para comentários e inbox
  console.log(
    "Comment Responder & Inbox Monitor: Serviço de monitoramento de comentários e inbox iniciado..."
  );
  setupDailyScheduleCommentsInbox(); // Configura o agendamento diário para comentários e inbox
  console.log(
    "Comment Responder & Inbox Monitor: Heartbeat: App está rodando em:",
    new Date()
  );
}

// Inicia o monitoramento de comentários e inbox e trata quaisquer erros no início
startMonitoringCommentsInbox().catch((error) => {
  console.error(
    "Comment Responder & Inbox Monitor: Erro ao iniciar o monitoramento de comentários e inbox:",
    error
  );
});
