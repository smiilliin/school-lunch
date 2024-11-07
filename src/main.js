const { IgApiClient } = require("instagram-private-api");
const dotenv = require("dotenv");
const fs = require("fs");
const PImage = require("pureimage");
const { Writable } = require("stream");

dotenv.config();

const groupID = Number(process.env["GROUP_ID"]);

const writeImage = (title, content, date) => {
  return new Promise((resolve) => {
    const image = PImage.make(1080, 1080);

    const ctx = image.getContext("2d");

    ctx.fillStyle = "#1A1C1D";
    ctx.fillRect(0, 0, 1080, 1080);

    const font = PImage.registerFont("NotoSansKR-Regular.ttf", "Noto Sans KR");

    font.loadSync();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "48pt 'Noto Sans KR'";
    const drawText = (text, x, y) => {
      const lineHeight = 60;
      text.split("\n").forEach((t, i) => {
        ctx.fillText(t, x, y + lineHeight * i);
      });
    };
    drawText(title, 32, 120);
    drawText(content, 32, 240);
    drawText(date, 32, 1080 - 48);

    const buffers = [];
    const stream = new Writable();
    stream._write = (chunk, _, callback) => {
      buffers.push(chunk);
      callback();
    };
    stream.on("finish", () => {
      resolve(Buffer.concat(buffers));
    });

    PImage.encodeJPEGToStream(image, stream);
  });
};

const getDateString = () => {
  const date = new Date(Date.now() + 1000 * 60 * 60 * 2);
  const dateString = `${date.getFullYear()}.${(
    "00" +
    (date.getMonth() + 1)
  ).slice(-2)}.${("00" + date.getDate()).slice(-2)}`;
  return dateString;
};

const intervalCallback = async () => {
  const dateString = getDateString();

  if (fs.existsSync("last.txt")) {
    const lastDate = fs.readFileSync("last.txt").toString();

    if (lastDate == dateString) return;
  }

  console.log("try fetch");
  const dataCallback = async (data, token) => {
    let filteredArticles = data.articles.filter(
      (article) =>
        article.local_date_of_pub_date == dateString &&
        article.group_id == groupID
    );
    console.log(dateString);
    if (filteredArticles.length == 0) {
      try {
        const tempData = JSON.parse(fs.readFileSync("temp.json").toString());
        filteredArticles = tempData.filter(
          (article) => article.date == dateString
        );
      } catch (err) {
        console.error(err);
      }

      if (filteredArticles.length == 0) {
        console.log(`${token}token lunch is undefined`);
        return false;
      }
    }
    const authors = ["조식", "중식", "석식"];

    const orderedArticles = filteredArticles.sort(
      (a, b) => authors.indexOf(a.author) - authors.indexOf(b.author)
    );
    const simplicatedArticles = orderedArticles.map((x) => {
      return {
        title: x.title,
        content: x.content,
        date: dateString,
      };
    });

    console.log("uploading");
    const ig = new IgApiClient();
    ig.state.generateDevice(process.env.ID);

    await ig.account.login(process.env.ID, process.env.PASSWORD);

    const items = await Promise.all(
      simplicatedArticles.map(async (x) => {
        return {
          file: await writeImage(x.title, x.content, x.date),
        };
      })
    );

    let publishResult;
    if (items.length == 1) {
      publishResult = await ig.publish.photo({
        file: items[0].file,
        caption: `급식(${dateString})`,
      });
    } else {
      publishResult = await ig.publish.album({
        items: items,
        caption: `급식(${dateString})`,
      });
    }

    console.log(publishResult);

    if (publishResult?.status == "ok") {
      fs.writeFileSync("last.txt", dateString);
      return true;
    }
    return false;
  };

  let token = 0;
  for (let i = 0; i < 8; i++) {
    try {
      const raw = await fetch(
        `https://school.iamservice.net/api/article/organization/${process.env.SCHOOL_ID}?next_token=${token}`
      );
      const data = await raw.json();

      if (await dataCallback(data, token)) {
        break;
      }

      token = data.next_token;
    } catch (err) {
      console.error(err);
      fs.writeFileSync("last.txt", getDateString());
      //stop when instagram error occurs
      break;
    }
  }
};

console.log("started school-lunch");
intervalCallback();

setInterval(intervalCallback, 1000 * 60 * 10);
