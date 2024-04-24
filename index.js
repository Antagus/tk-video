/*  by Naufal Taufiq Ridwan
    Github : https://github.com/n0l3r
    Don't remove credit.
*/

const fetch = require("node-fetch")
const chalk = require("chalk")
const inquirer = require("inquirer")
const fs = require("fs")
const puppeteer = require("puppeteer")
const { exit } = require("process")
const { resolve } = require("path")
const { reject } = require("lodash")
const { Headers } = require("node-fetch")
const readline = require("readline")

//load inq module
inquirer.registerPrompt("fuzzypath", require("inquirer-fuzzy-path"))

//adding useragent to avoid ip bans
const headers = new Headers()
headers.append(
  "User-Agent",
  "TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet"
)

const getChoice = () =>
  new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          type: "list",
          name: "choice",
          message: "Choose a option",
          choices: [
            "Mass Download (Username)",
            "Mass Download with (txt)",
            "Single Download (URL)",
          ],
        },
        {
          type: "list",
          name: "type",
          message: "Choose a option",
          choices: ["With Watermark", "Without Watermark"],
        },
      ])
      .then((res) => resolve(res))
      .catch((err) => reject(err))
  })

const getInput = (message) =>
  new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          type: "input",
          name: "input",
          message: message,
        },
      ])
      .then((res) => resolve(res))
      .catch((err) => reject(err))
  })

const generateUrlProfile = (username) => {
  var baseUrl = "https://www.tiktok.com/"
  if (username.includes("@")) {
    baseUrl = `${baseUrl}${username}`
  } else {
    baseUrl = `${baseUrl}@${username}`
  }
  return baseUrl
}

const downloadMedia = async (item) => {
  return new Promise((resolve, reject) => {
    const folder = "downloads/"

    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })

    // check for slideshow
    if (item.images.length !== 0) {
      console.log(chalk.green("[*] Downloading Slideshow"))

      let index = 0
      item.images.forEach((image_url) => {
        const fileName = `${item.id}_${index}.jpeg`
        // check if file was already downloaded
        if (fs.existsSync(folder + fileName)) {
          console.log(
            chalk.yellow(`[!] File '${fileName}' already exists. Skipping`)
          )
          return
        }
        index++
        const downloadFile = fetch(image_url)
        const file = fs.createWriteStream(folder + fileName)

        downloadFile.then((res) => {
          res.body.pipe(file)
          file.on("finish", () => {
            file.close()
            resolve()
          })
          file.on("error", (err) => reject(err))
        })
      })
    } else {
      const fileName = `${item.id}.mp4`
      // check if file was already downloaded
      if (fs.existsSync(folder + fileName)) {
        console.log(
          chalk.yellow(`[!] File '${fileName}' already exists. Skipping`)
        )
        resolve()
        return
      }
      const downloadFile = fetch(item.url)
      const file = fs.createWriteStream(folder + fileName)

      downloadFile.then((res) => {
        res.body.pipe(file)
        file.on("finish", () => {
          file.close()
          resolve()
        })
        file.on("error", (err) => reject(err))
      })
    }
  })
}

// url contains the url, watermark is a bool that tells us what link to use
const getVideo = async (url, watermark) => {
  const idVideo = await getIdVideo(url)
  const API_URL = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${idVideo}`

  const request = await fetch(API_URL, {
    method: "GET",
    headers: headers,
  })
  const body = await request.text()
  try {
    var res = JSON.parse(body)
  } catch (err) {
    return null
  }

  // check if video was deleted
  if (res.aweme_list[0].aweme_id != idVideo) {
    return null
  }

  let urlMedia = ""
  let image_urls = []
  // check if video is slideshow
  if (!!res.aweme_list[0].image_post_info) {
    console.log(chalk.green("[*] Video is slideshow"))
    // get all image urls
    res.aweme_list[0].image_post_info.images.forEach((element) => {
      image_urls.push(element.display_image.url_list[1])
    })
  } else {
    // download_addr vs play_addr
    urlMedia = res.aweme_list[0].video.play_addr.url_list[0]
  }

  const data = {
    url: urlMedia,
    images: image_urls,
    id: idVideo,
  }
  return data
}

const getListVideoByUsername = async (username) => {
  var baseUrl = await generateUrlProfile(username)
  const browser = await puppeteer.launch({
    headless: false,
  })
  const page = await browser.newPage()
  page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4182.0 Safari/537.36"
  )
  await page.goto(baseUrl)
  var listVideo = []
  console.log(chalk.green("[*] Getting list video from: " + username))
  var loop = true
  while (loop) {
    listVideo = await page.evaluate(() => {
      const listVideo = document.querySelectorAll("a")
      const videoUrls2 = Array.from(listVideo)
        .map((item) => item.href)
        .filter((href) => href.includes("/video/"))
        .filter((value, index, self) => self.indexOf(value) === index)
      return videoUrls2
    })
    console.log(chalk.green(`[*] ${listVideo.length} video found`))
    previousHeight = await page.evaluate("document.body.scrollHeight")
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await page
      .waitForFunction(`document.body.scrollHeight > ${previousHeight}`, {
        timeout: 10000,
      })
      .catch(() => {
        console.log(chalk.red("[X] No more video found"))
        console.log(chalk.green(`[*] Total video found: ${listVideo.length}`))
        loop = false
      })
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  await browser.close()
  return listVideo
}
const getRedirectUrl = async (url) => {
  if (url.includes("vm.tiktok.com") || url.includes("vt.tiktok.com")) {
    url = await fetch(url, {
      redirect: "follow",
      follow: 10,
    })
    url = url.url
    console.log(chalk.green("[*] Redirecting to: " + url))
  }
  return url
}

const getIdVideo = async (url) => {
  if (url.includes("/t/")) {
    url = await new Promise((resolve) => {
      require("follow-redirects").https.get(url, function (res) {
        return resolve(res.responseUrl)
      })
    })
  }
  const matching = url.includes("/video/")
  if (!matching) {
  }
  let idVideo = url.substring(
    url.indexOf("/video/") + 7,
    url.indexOf("/video/") + 26
  )
  return idVideo.length > 19
    ? idVideo.substring(0, idVideo.indexOf("?"))
    : idVideo
}

var mainStartProgramm = async () => {
  var choice = { choice: "1" }
  var listVideo = []
  if (choice.choice === "Mass Download (Username)") {
    const usernameInput = await getInput(
      "Enter the username with @ (e.g. @username) : "
    )
    const username = usernameInput.input
    listVideo = await getListVideoByUsername(username)
    if (listVideo.length === 0) {
      console.log(chalk.yellow("[!] Error: No video found"))
      exit()
    }
  } else if (choice.choice === "Mass Download with (txt)") {
    var urls = []
    // Get URL from file
    const fileInput = await inquirer.prompt([
      {
        type: "fuzzypath",
        name: "input",
        excludePath: (nodePath) => {
          return nodePath.includes("node_modules") || nodePath.includes(".git")
        },
        excludeFilter: (nodePath) => {
          if (nodePath.includes(".txt")) console.log(nodePath)
          return !nodePath.endsWith(".txt")
        },
        itemType: "file",
        rootPath: __dirname,
        message: "Select a target directory for your component:",
        default: "list.txt",
        suggestOnly: false,
        depthLimit: 5,
      },
    ])

    const file = fileInput.input

    if (!fs.existsSync(file)) {
      console.log(chalk.red("[X] Error: File not found"))
      exit()
    }

    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      if (urls.includes(line)) {
        console.log(chalk.yellow(`[!] Skipping duplicate entry: ${line}`))
        continue
      }
      urls.push(line)
      console.log(chalk.green(`[*] Found URL: ${line}`))
    }

    for (var i = 0; i < urls.length; i++) {
      const url = await getRedirectUrl(urls[i])
      listVideo.push(url)
    }
  } else {
    // const urlInput = await getInput("Enter the URL : ")
    const urlInput = {
      input: "https://www.tiktok.com/@manusemi/video/7337323170166230304",
    }
    const url = await getRedirectUrl(urlInput.input)
    listVideo.push(url)
  }

  console.log(chalk.green(`[!] Found ${listVideo.length} video`))

  let deleted_videos_count = 0
  for (var i = 0; i < listVideo.length; i++) {
    console.log(
      chalk.green(`[*] Downloading video ${i + 1} of ${listVideo.length}`)
    )
    console.log(chalk.green(`[*] URL: ${listVideo[i]}`))
    var data = await getVideo(listVideo[i], choice.type == "With Watermark")

    if (data == null) {
      console.log(chalk.yellow(`[!] Video ${i + 1} was deleted!`))
      deleted_videos_count++
      continue
    }

    downloadMedia(data)
      .then(() => {
        console.log(chalk.green("[+] Downloaded successfully"))
      })
      .catch((err) => {
        console.log(chalk.red("[X] Error: " + err))
      })
  }

  if (deleted_videos_count > 0) {
    console.log(
      chalk.yellow(
        `[!] ${deleted_videos_count} of ${listVideo.length} videos were deleted!`
      )
    )
  }
}

const TelegramBot = require("node-telegram-bot-api")

// Ваш токен, полученный у BotFather
const token = "7138329072:AAGeWzC90bHJlsUqKqzqIZfitikKfcCz4TQ"

// Создание экземпляра бота
const bot = new TelegramBot(token, { polling: true })

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  bot.sendMessage(
    chatId,
    "Здравствуйте! Я бот, специализированный на загрузке видео с TikTok без водяных знаков. \n\nДля коммерческих запросов обращайтесь: @gustravel."
  )
})

// Обработчик для простого ответа на текстовые сообщения
bot.on("message", async (msg) => {
  const chatId = msg.chat.id

  const urlInput = {
    input: msg.text,
  }

  try {
    const url = await getRedirectUrl(urlInput.input)
    const data = await getVideo(url, "With Watermark")

    if (data !== null) {
      const filePath = `downloads/${data.id}.mp4`
      bot.sendMessage(
        chatId,
        "Загрузка видео началась. \nОжидайте в среднем это занимает около 30 секунд"
      )

      await downloadMedia(data) // Ожидаем завершения загрузки видео

      bot.sendVideo(chatId, filePath, {
        caption: "Видео из тики-тока. Бот @tickdown_bot",
        contentType: "video/mp4",
      })
    }
  } catch (error) {
    console.log("Error occurred:", error)
  }
})
