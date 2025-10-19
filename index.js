import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import querystring from "querystring";
import https from "https";


dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const FATSECRET_BASE_URL = process.env.FATSECRET_BASE_URL;
const FATSECRET_KEY = process.env.FATSECRET_KEY;
const FATSECRET_SECRET = process.env.FATSECRET_SECRET;

function getOAuthParams(method, url, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: FATSECRET_KEY,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_version: "1.0",
  };

  const allParams = { ...oauthParams, ...extraParams };
  const sortedParams = Object.keys(allParams).sort().reduce((acc, key) => {
    acc[key] = allParams[key];
    return acc;
  }, {});

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(querystring.stringify(sortedParams)),
  ].join("&");

  const signingKey = `${FATSECRET_SECRET}&`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  return { ...oauthParams, oauth_signature: signature };
}

app.get("/food/search", async (req, res) => {
  console.log("Search route called! Query:", req.query.q);

  try {
    const query = req.query.q;
    const searchParams = {
      method: "foods.search",
      search_expression: query,
      format: "json",
    };

    const searchOauth = getOAuthParams("GET", FATSECRET_BASE_URL, searchParams);
    const fullSearchParams = { ...searchParams, ...searchOauth };

    // Search foods
    const searchResponse = await axios.get(FATSECRET_BASE_URL, { params: fullSearchParams });

    let foods = searchResponse.data.foods?.food;

    //Normalize: handle if it's an object or array
    if (!foods) {
      return res.status(404).json({ error: "No food data found" });
    }
    if (!Array.isArray(foods)) {
      foods = [foods];
    }

    //Pick the first food
    const firstFood = foods[0];

    //Get detailed info for that food
    const detailParams = {
      method: "food.get.v2",
      food_id: firstFood.food_id,
      format: "json",
    };
    const detailOauth = getOAuthParams("GET", FATSECRET_BASE_URL, detailParams);
    const fullDetailParams = { ...detailParams, ...detailOauth };

    const detailResponse = await axios.get(FATSECRET_BASE_URL, { params: fullDetailParams });

    //Handle single-object detail or nested food object
    const foodDetail =
      detailResponse.data?.food ||
      detailResponse.data?.foods?.food ||
      detailResponse.data ||
      {};

    //Return consistent single-object format
    res.json({ food: foodDetail });
  } catch (error) {
    console.error("FatSecret API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch data from FatSecret" });
  }
});





app.get("/food/:id", async (req, res) => {
  try {
    const foodId = req.params.id;

    const params = {
      method: "food.get.v3",
      food_id: foodId,
      format: "json",
    };

    const oauthParams = getOAuthParams("GET", FATSECRET_BASE_URL, params);
    const fullParams = { ...params, ...oauthParams };

    // 🛡 Use HTTPS agent to bypass SSL validation issues (temporary for local testing)
    const agent = new https.Agent({ rejectUnauthorized: false });

    const response = await axios.get(FATSECRET_BASE_URL, {
      params: fullParams,
      httpsAgent: agent,
    });

    const food = response.data?.food;
    if (!food) {
      return res.status(404).json({ error: "Food not found" });
    }
    let images = [];
    if (food.food_images) {
      if (Array.isArray(food.food_images.food_image)) {
        images = food.food_images.food_image.map(img => img.image_url);
      } else if (food.food_images.food_image?.image_url) {
        images = [food.food_images.food_image.image_url];
      }
    }

    res.json({
      ...food,
      images,
    });
  } catch (error) {
    console.error(
      "FatSecret API Error:",
      error.response?.data || error.message || error
    );
    res.status(500).json({ error: "Failed to fetch food details" });
  }
});


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

