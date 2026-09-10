const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
 
const PORT = process.env.PORT || 7000;
 
const builder = new addonBuilder({
  id: "com.perso.movixcloud",
  version: "3.1.0",
  name: "MovixCloud Stream",
  description: "Contenu exclusif et flux directs depuis Movix.cloud",
  resources: ["catalog", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [
    {
      type: "movie",
      id: "movix_movies_exclusive",
      name: "Catalogue Movix - Films"
    },
    {
      type: "series",
      id: "movix_series_exclusive",
      name: "Catalogue Movix - Séries"
    }
  ]
});
 
// 1. CATALOGUE 100% ISSU DE MOVIX.CLOUD
builder.defineCatalogHandler(async (args) => {
  console.log(`[CATALOGUE MOVIX] Extraction des contenus depuis le site... (${args.type})`);
 
  try {
    // URL source sur Movix (ex: https://movix.cloud/movies ou https://movix.cloud/tv-shows)
    const categoryPath = args.type === "movie" ? "movies" : "tv-shows";
    const movixUrl = `https://movix.cloud/${categoryPath}`;
 
    const response = await axios.get(movixUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 7000
    });
 
    const $ = cheerio.load(response.data);
    const metas = [];
 
    // On parcourt les cartes de films/séries sur la page de Movix
    // (Ajuste les sélecteurs '.card', '.poster', 'a' selon la structure HTML exacte)
    $(".card, article, .movie-item, .item").each((index, element) => {
      const title = $(element).find(".title, h2, h3, .name").text().trim();
      const poster = $(element).find("img").attr("src") || $(element).find("img").attr("data-src");
      const link = $(element).find("a").attr("href") || "";
 
      // Extraction de l'ID TMDb depuis l'URL de la carte (ex: /watch/tv/95557 ou /watch/movie/12345)
      const tmdbMatch = link.match(/\/(movie|tv)\/(\d+)/);
      const tmdbId = tmdbMatch ? tmdbMatch[2] : null;
 
      if (title && tmdbId) {
        metas.push({
          id: `tmdb:${tmdbId}`, // Format compréhensible par Stremio
          type: args.type,
          name: title,
          poster: poster && poster.startsWith("//") ? "https:" + poster : poster,
          description: `Disponible sur Movix.cloud`
        });
      }
    });
 
    console.log(`[CATALOGUE] ${metas.length} éléments trouvés sur Movix.`);
    return { metas };
 
  } catch (error) {
    console.error("[ERREUR CATALOGUE EXCLUSIF] :", error.message);
    return { metas: [] };
  }
});
 
// 2. GESTION DES FLUX VIDÉO (Stream Handler)
builder.defineStreamHandler(async (args) => {
  console.log(`[STREAM] Demande reçue : ${args.type} (${args.id})`);
 
  try {
    let tmdbId = null;
    let season = "1";
    let episode = "1";
 
    // Si l'élément vient de notre catalogue Movix (ID au format tmdb:12345)
    if (args.id.startsWith("tmdb:")) {
      const parts = args.id.replace("tmdb:", "").split(":");
      tmdbId = parts[0];
      season = parts[1] || "1";
      episode = parts[2] || "1";
    } else {
      // Si l'élément vient de la recherche standard IMDb (tt1234567)
      const idParts = args.id.split(":");
      const imdbId = idParts[0];
      season = idParts[1] || "1";
      episode = idParts[2] || "1";
 
      const metaResponse = await axios.get(`https://v3-cinemeta.strem.fun/meta/${args.type}/${imdbId}.json`);
      const meta = metaResponse.data?.meta;
      if (meta) {
        tmdbId = meta.moviedb_id || meta.id;
      }
    }
 
    if (!tmdbId) {
      return { streams: [] };
    }
 
    let targetUrl = args.type === "series"
      ? `https://movix.cloud/watch/tv/${tmdbId}/s/${season}/e/${episode}`
      : `https://movix.cloud/watch/movie/${tmdbId}`;
 
    console.log(`[CIBLE] URL du lecteur : ${targetUrl}`);
 
    const pageResponse = await axios.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://movix.cloud/"
      },
      timeout: 8000
    });
 
    const $ = cheerio.load(pageResponse.data);
 
    let streamUrl = $("iframe").attr("src") ||
                    $("video source").attr("src") ||
                    $("[data-src]").attr("data-src");
 
    const streams = [];
 
    if (streamUrl) {
      if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
 
      streams.push({
        name: "Movix.cloud",
        title: `🎬 Stream Direct [HTTP]`,
        url: streamUrl
      });
    } else {
      streams.push({
        name: "Movix.cloud",
        title: `⚠️ Ouvrir la page Movix.cloud`,
        externalUrl: targetUrl
      });
    }
 
    return { streams };
 
  } catch (error) {
    console.error(`[ERREUR STREAM] :`, error.message);
    return { streams: [] };
  }
});
 
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Addon prêt avec Catalogue 100% Movix sur le port ${PORT}`);
