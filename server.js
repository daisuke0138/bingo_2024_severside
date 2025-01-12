// まずはexpressというnode.jsの機能を使えるように読み込みましょう🤗
const express = require("express");

//CORS対策
const cors = require("cors");

// prismaのclientの機能を使えるようにする🤗
const { PrismaClient } = require("@prisma/client");

// パスワードハッシュ化
const bcrypt = require("bcrypt");

// json web toknの機能を使えるようにする🤗
const jwt = require("jsonwebtoken");

// 環境変数=秘密の鍵が使えるようにdotenvを記述して使えるようにします🤗
require("dotenv");

// ここで実行をし、appの中にexpressの機能を使えるようにしています🤗
const app = express();

// clientの機能を使えるように設定する
const prisma = new PrismaClient();

// CORS設定
// app.use(cors({
//     origin: 'https://bingo-2024front.vercel.app', // 許可するオリジンを指定
//     credentials: true // クッキーを含むリクエストを許可
// }));
app.use(cors());

// jsで書いた文字列をjsonとしてexpressで使えるようにする必要があります🤗
app.use(express.json());

const { createClient } = require('@supabase/supabase-js')
const QRCode = require('qrcode')

// Supabaseクライアントの初期化
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY // 注意: ANON_KEYを使用
)



// PORT=は起動するURLの番号になります🤗とても重要なので今回は統一してください🤗
const PORT = process.env.PORT || 8888;

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

// ユーザー情報取得API
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
            select: { id: true, username: true }
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

// ゲーム登録API
app.post('/api/auth/create', async (req, res) => {
    const { title ,userId } = req.body

    // 既存のタイトルをチェックする🤗
    const existingTitle = await prisma.game.findFirst({
        where: { title }
    });

    if (existingTitle) {
        return res.status(400).json({
            error: "そのtitleは既に登録されています。別のtitle名を使用してください。",
        });
    }

    if (!userId || !title) {
        return res.status(400).json({ error: 'Missing userId or title' })
    }

    try {
            // 1. ゲームの作成
            const game = await prisma.game.create({
                data: {
                    title,
                    user: { connect: { id: userId } }
                }
            })

            // 2. ゲームURLの生成
            const gameUrl = `https://bingo-2024front.vercel.app/game/${game.id}`

            // 3. QRコードの生成
            const qrBuffer = await QRCode.toBuffer(gameUrl, {
                width: 300,
                margin: 2,
                errorCorrectionLevel: 'H'
            })

            // 4. QRコード画像をSupabaseにアップロード
            const fileName = `game-${game.id}.png`
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('QR_code')
                .upload(fileName, qrBuffer, {
                    contentType: 'image/png',
                    upsert: true
                })
            if (uploadError) {
                console.error('QRコードのアップロードエラー:', uploadError)
                throw new Error('QRコードの生成に失敗しました')
            }

            // 5. QRコードの公開URLを取得
            const { data: { publicUrl } } = supabase
                .storage
                .from('qr_code')
                .getPublicUrl(fileName)

            // 6. ゲーム情報をQRコードURLで更新
            const updatedGame = await prisma.game.update({
                where: { id: game.id },
                data: { qrCodeUrl: publicUrl }
            })
            res.status(200).json({
                ...updatedGame,
                gameUrl,
                qrCodeUrl: publicUrl
            })

    } catch (error) {
            console.error(error)
            res.status(500).json({
                error: 'ゲームの作成に失敗しました。もう一度お試しください。'
            })
    }
})

// ゲームtitle取得API
app.get("/api/auth/title", async (req, res) => {
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
        console.log("get title created Userid :", userId);

        // ログインユーザーが登録したタイトルを取得
        const games = await prisma.game.findMany({
            where: { userId },
            select: { id: true, title: true }
        });

        res.status(200).json(games);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'タイトルの取得に失敗しました' });
    }
});

// ゲーム選択API
app.post('/api/auth/selectgame', async (req, res) => {
    const { gameId } = req.body;

    try {
        const game = await prisma.game.findUnique({
            where: { id: parseInt(gameId) },
            select: {
                id: true,
                title: true,
                qrCodeUrl: true
            }
        });

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        res.status(200).json(game);
    } catch (error) {
        console.error('Error fetching game data:', error);
        res.status(500).json({ error: 'Failed to fetch game data' });
    }
});


// // express serverの起動
// app.listen(PORT, () => console.log("Server is running "));

// デプロイ環境で使用。appをエクスポート、ローカル環境ではコメントアウトすること
module.exports = app;
