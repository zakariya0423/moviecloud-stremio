const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
 
const PORT = process.env.PORT || 7000;
 
const builder = new addonBuilder({
  id: "com.perso.movixcloud",
  version: "2.0.0",
  name: "MovixCloud Stream",
  description: "Récupère les flux directs depuis Movix.cloud",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs:[]
});
 
builder.defineStreamHandler(async (args) => {
  console.log(`[INFO] Demande reçue : ${args.type} (${args.id})`);
 
  try {
    // 1. Découpage de l'ID Stremio (tt1234567:1:2)
    const idParts = args.id.split(":");
    const imdbId = idParts[0];
    const season = idParts[1] || "1";
    const episode = idParts[2] || "1";
 
    // 2. Conversion IMDb -> TMDb ID + Titre via l'API Cinemeta
    const metaResponse = await axios.get(`https://v3-cinemeta.strem.fun/meta/${args.type}/${imdbId}.json`);
    const meta = metaResponse.data?.meta;
 
    if (!meta) {
      console.log("[ERREUR] Impossible de récupérer les métadonnées Cinemeta.");
      return { streams: [] };
    }
 
    // Cinemeta fournit souvent l'ID TMDb dans l'objet "moviedb_id"
    const tmdbId = meta.moviedb_id || meta.id;
    const title = meta.name;
 
    console.log(`[MÉDIA] "${title}" | TMDb ID: ${tmdbId} | Type: ${args.type}`);
 
    // 3. Construction de l'URL exacte selon la structure de Movix.cloud
    let targetUrl = "";
 
    if (args.type === "series") {
      // Structure exacte : movix.cloud/watch/tv/{tmdb_id}/s/{saison}/e/{episode}
      targetUrl = `https://movix.cloud/watch/tv/${tmdbId}/s/${season}/e/${episode}`;
    } else {
      // Structure exacte pour les films : movix.cloud/watch/movie/{tmdb_id}
      targetUrl = `https://movix.cloud/watch/movie/${tmdbId}`;
    }
 
    console.log(`[CIBLE] Ouverture de l'URL : ${targetUrl}`);
 
    // 4. Chargement de la page web
    const pageResponse = await axios.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://movix.cloud/"
      },
      timeout: 7000
    });
 
    // 5. Extraction du lecteur vidéo (Iframe / Video / Embed)
    const $ = cheerio.load(pageResponse.data);
    let streamUrl = $("iframe#player").attr("src") ||
                    $("iframe").attr("src") ||
                    $("video source").attr("src") ||
                    $("#iframe-embed").attr("src");
 
    if (streamUrl) {
      if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
 
      const displayTitle = args.type === "series"
        ? `🎬 ${title} - S${season}E${episode} [HTTP]`
        : `🎬 ${title} [HTTP]`;
 
      return {
        streams: [
          {
            name: "Movix.cloud",
            title: displayTitle,
            url: streamUrl
          }
        ]
      };
    } else {
      console.log("[ERREUR] Aucun lecteur vidéo (iframe) trouvé sur la page.");
    }
 
  } catch (error) {
    console.error(`[ERREUR ROUTE] Impossible de charger ${error.config?.url || 'URL'} :`, error.message);
  }
 
  return { streams: [] };
});
 
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Addon démarré sur le port ${PORT}`);
