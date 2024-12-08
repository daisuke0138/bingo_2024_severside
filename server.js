// まずはexpressというnode.jsの機能を使えるように読み込みましょう🤗
const express = require("express");

// ここで実行をし、appの中にexpressの機能を使えるようにしています🤗
const app = express();

// prismaのclientの機能を使えるようにする🤗
const { PrismaClient } = require("@prisma/client");

// パスワードハッシュ化
const bcrypt = require("bcrypt");

// json web toknの機能を使えるようにする🤗
const jwt = require("jsonwebtoken");

// 環境変数=秘密の鍵が使えるようにdotenvを記述して使えるようにします🤗
require("dotenv");

//CORS対策
const cors = require("cors");

app.use(cors());

// PORT=は起動するURLの番号になります🤗とても重要なので今回は統一してください🤗
const PORT = 8888;

// clientの機能を使えるように設定する
const prisma = new PrismaClient();

// jsで書いた文字列をjsonとしてexpressで使えるようにする必要があります🤗
app.use(express.json());

// 新規ユーザーAPI
app.post("/api/auth/signup", async (req, res) => {
    const { username, password } = req.body;

    // 既存のユーザーをチェックする🤗
    const existingUser = await prisma.user.findFirst({
        where: { username }
    });

    if (existingUser) {
        return res.status(400).json({
            error: "そのユーザー名は既に登録されています。別のユーザー名を使用してください。",
        });
    }

    // 暗号化対応=bcryptを使ってハッシュ化する🤗
    const hashedPass = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: {
            username,
            password: hashedPass,
        },
    });

    return res.json({ user });
});

// ログインAPI
app.post("/api/auth/login", async (req, res) => {
    // username, passwordをチェックするために取得します🤗
    const { username , password } = req.body;

    // // whereはSQL等で出てくる条件を絞るという条件です🤗
    const user = await prisma.user.findFirst({ where: { username } });

    if (!user) {
        return res.status(401).json({
            error: "そのユーザーは存在しません",
        });
    }

    //compare bcryptのcompareは比較をしてチェックするおまじないです🤗
    const isPasswordCheck = await bcrypt.compare(password, user.password);

    if (!isPasswordCheck) {
        return res.status(401).json({
            error: "そのパスワードは間違っていますよ！",
        });
    }

    // token = チケットのイメージです🤗
    const token = jwt.sign({ id: user.id }, process.env.KEY, {
        expiresIn: "1d",
    });
    console.log("login success"); // ログイン成功時にコンソールに表示

    // トークンをクライアント側へ送信
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly`);

    return res.json({ token });
});

app.get("/api/auth/user", async (req, res) => {
    // リクエストヘッダーからトークンを取得
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "トークンが提供されていません" });
    }

    try {
        // トークンを検証してdecodeに変数としてトークンを格納
        const decoded = jwt.verify(token, process.env.KEY);
        // トークンからユーザーIDを取得
        const userId = decoded.id;

        // ユーザーIDをログに出力
        console.log("Userid:", userId);

        // Prisma Clientを使用してdbのidとトークンから取得したユーザーid(リクエストあったユーザー)を
        // 検索してデータ取得
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        console.log("getdata:", user);

        if (!user) {
            return res.status(404).json({ error: "ユーザーが見つかりません" });
        }

        // ユーザー情報をJSON形式でuserに格納してフロントへ送信
        return res.json({ user });
    } catch (error) {
        console.error("Error fetching user data:", error);
        return res.status(500).json({ error: "ユーザーデータの取得中にエラーが発生しました" });
    }
});

// ログアウトAPI
app.post("/api/auth/logout", (req, res) => {
    // クライアント側でセッションやトークンを削除するように指示
    res.setHeader('Set-Cookie', 'token=; HttpOnly; Max-Age=0');// クッキーを無効化

    console.log("logout success"); // ログイン成功時にコンソールに表示

    return res.json({ message: "ログアウトしました" });
});


// express serverの起動
app.listen(PORT, () => console.log("Server is running "));