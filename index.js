const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
 
const PORT = process.env.PORT || 7000;
 
const builder = new addonBuilder({
  id: "com.perso.moviecloud",
  version: "1.0.0",
  name: "MovieCloud Stream",
  description: "Récupère les liens depuis MovieCloud",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"]
});
 
builder.defineStreamHandler(async (args) => {
  console.log(`[INFO] Recherche IMDb ID : ${args.id}`);
 
  try {
    const searchUrl = `https://movie.cloud/search?imdb=${args.id}`;
    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 5000
    });
 
    const $ = cheerio.load(response.data);
    let streamUrl = $("iframe#player").attr("src") || $("video source").attr("src");
 
    if (streamUrl) {
      if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
 
      return {
        streams: [
          {
            name: "MovieCloud",
            title: "🎬 Stream Web [HTTP Direct]",
            url: streamUrl
          }
        ]
      };
    }
  } catch (error) {
    console.error(`[ERREUR] :`, error.message);
  }
 
  return { streams: [] };
});
 
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Addon prêt sur le port ${PORT}`);
