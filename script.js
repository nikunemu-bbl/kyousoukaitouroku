
// =====================================
// Symphonia Award App
// 選手データ解析・ポイント計算
// =====================================

// Google Apps Script WebアプリURL
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz01yclXuqmQ2phtxGXWr8-cG4ZaU-UdvIlTtHivwf4-uEZOihND-lDPSH9HeqX1iDE/exec";
// コピーした文章の整形
function normalizeCopiedData(data) {
    return data
        .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
        .replace(/\*\*/g, "")
        .replace(/\u3000/g, " ")
        .trim();
}
// 成績データを読み取る
function getStat(data, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
        escaped + "\\s*\\n\\s*([\\d,]+)",
        "m"
    );
    const match = data.match(regex);
    if (!match) return 0;
    return Number(match[1].replace(/,/g, ""));
}
// 小数点を含む成績データを読み取る
function getStatDecimal(data, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
        "(?:^|\\r?\\n)\\s*" + escaped + "\\s*\\r?\\n\\s*([\\d,.]+)",
        "m"
    );
    const match = data.match(regex);
    if (!match) return 0;
    return Number(match[1].replace(/,/g, ""));
}
function getInnings(data) {
    const regex = /(?:^|\r?\n)\s*投球回\s*\r?\n\s*(\d+)(?:回(?:(\d+)\/(\d+))?)?/m;
    const match = data.match(regex);
    if (!match) return 0;
    const whole = Number(match[1]);
    const numerator = Number(match[2] || 0);
    return Number(`${whole}.${numerator}`);
}
// 選手の基本情報を読み取る
function getPlayerInfo(data, html) {
    const normalized = normalizeCopiedData(data);
    const lines = normalized.split(/\r?\n/);
    const info = {
        name: "不明",
        creator: "不明",
        position: "不明",
        playerId: "不明",
        jerseyNumber: "",
        teamName: "不明",
        retirementYear: null,
        career: ""
    };
    // HTMLからリンク情報を取得
    const pastedHTML = document.createElement("div");
    pastedHTML.innerHTML = html;
    const links = [...pastedHTML.querySelectorAll("a[href]")];
    // 球団リンク
    const teamLink = links.find(link =>
        /\/team\/\d+/.test(link.getAttribute("href"))
    );
    if (teamLink) {
        info.teamName = teamLink.textContent.trim();
        info.teamUrl = teamLink.href;
    }
    // 製作者リンク
    const creatorLink = links.find(link =>
        /\/user\/\d+/.test(link.getAttribute("href"))
    );
    if (creatorLink) {
        info.creator = creatorLink.textContent.trim();
        info.creatorUrl = creatorLink.href;
    }
    // 選手リンク
    const playerLink = links.find(link =>
        /\/player\/\d+/.test(link.getAttribute("href"))
    );
    if (playerLink) {
        info.name = playerLink.textContent.trim();
        info.playerUrl = playerLink.href;
        const idMatch = playerLink.href.match(/\/player\/(\d+)/);
        if (idMatch) {
            info.playerId = idMatch[1];
        }
        // 背番号を取得
        const previous = playerLink.previousElementSibling;
        if (previous) {
            info.jerseyNumber = previous.textContent.trim();
        }
    }
    // 球団名
    const teamMatch = data.match(/\[\*\*(.*?)\*\*\]\(https:\/\/baseball-life\.games\/team\/\d+\)/);
    if (teamMatch) info.teamName = teamMatch[1];
    // 作成者名
    const creatorMatch = data.match(/\[([^\]]+)\]\(https:\/\/baseball-life\.games\/user\/\d+\)/);
    if (creatorMatch) info.creator = creatorMatch[1];
    // 背番号・選手名・選手ID
    const playerMatch = data.match(/\*\*(\d+)\*\*\s*\[([^\]]+)\]\(https:\/\/baseball-life\.games\/player\/(\d+)\)/);
    if (playerMatch) {
        info.jerseyNumber = playerMatch[1];
        info.name = playerMatch[2];
        info.playerId = playerMatch[3];
    }
    // 選手ID（予備）
    if (info.playerId === "不明") {
        const idMatch = normalized.match(/選手ID\s*\n\s*(\d+)/);
        if (idMatch) info.playerId = idMatch[1];
    }
    // 守備位置
    const positionLine = data
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t\u3000]/g, ""))
    .find(line =>
        ["投手", "捕手", "内野手", "外野手"].includes(line)
    );
    if (positionLine) {
        info.position = positionLine;
    }
    // 引退年度
    const retirementMatch = normalized.match(/プロ年数\s*\n[^\n]*?[（(]\s*(\d+)年引退[）)]/);
    if (retirementMatch) {
        info.retirementYear = Number(retirementMatch[1]);
    }
    // 経歴
    const careerMatch = normalized.match(/経歴\s*\n([^\n]+)/);
    if (careerMatch) {
        info.career = careerMatch[1].trim();
    }
    return info;
}
// シンフォニア在籍・引退条件
function checkEligibility(info) {
    const clubName = "浜松ヴェレンシンフォニア";
    const playerCareer = info.career.split("【")[0].trim();
    const clubs = [
        ...playerCareer.matchAll(/([^()]+)\(\d{4}-\d{4}\)/g)
    ].map(match => match[1].trim());
    const lastClubMatch = playerCareer.match(
        /([^()]+)\(\d{4}-\d{4}\)\s*$/
    );
    const yearsMatch = playerCareer.match(
        new RegExp(clubName + "\\((\\d{4})-(\\d{4})\\)")
    );
    const years = yearsMatch
        ? Number(yearsMatch[2]) - Number(yearsMatch[1]) + 1
        : 0;
    const retiredAtClub = Boolean(
        info.retirementYear &&
        lastClubMatch &&
        lastClubMatch[1].trim() === clubName
    );
    const eligible = years >= 7 && retiredAtClub;
    // 生涯シンフォニア：経歴に他球団がなく、
    // シンフォニア所属で引退した場合
    const lifelong = eligible &&
        clubs.length === 1 &&
        clubs[0].trim() === clubName;
    return {
        eligible,
        lifelong
    };
}
// 最高条件のみを採用する採点関数
function getHighestScore(value, conditions) {
    for (const condition of conditions) {
        if (value >= condition.threshold) {
            return condition.points;
        }
    }
    return 0;
}
// 野手の採点
function scoreBatter(data) {
    const stats = {
        hits: getStat(data, "安打"),
        homeRuns: getStat(data, "本塁打"),
        rbi: getStat(data, "打点"),
        runs: getStat(data, "得点"),
        steals: getStat(data, "盗塁"),
        goodDefense: getStat(data, "好守備"),
        caughtStealing: getStat(data, "盗塁刺")
    };
    return [
        {
            name: "安打",
            value: stats.hits,
            points: getHighestScore(stats.hits, [
                { threshold: 4000, points: 50 },
                { threshold: 3000, points: 40 },
                { threshold: 2000, points: 20 },
                { threshold: 1500, points: 10 }
            ])
        },
        {
            name: "本塁打",
            value: stats.homeRuns,
            points: getHighestScore(stats.homeRuns, [
                { threshold: 800, points: 30 },
                { threshold: 600, points: 20 },
                { threshold: 400, points: 10 }
            ])
        },
        {
            name: "打点",
            value: stats.rbi,
            points: getHighestScore(stats.rbi, [
                { threshold: 3000, points: 40 },
                { threshold: 2000, points: 30 },
                { threshold: 1500, points: 20 },
                { threshold: 1000, points: 10 }
            ])
        },
        {
            name: "得点",
            value: stats.runs,
            points: getHighestScore(stats.runs, [
                { threshold: 2000, points: 30 },
                { threshold: 1500, points: 20 },
                { threshold: 1000, points: 10 }
            ])
        },
        {
            name: "盗塁",
            value: stats.steals,
            points: getHighestScore(stats.steals, [
                { threshold: 700, points: 30 },
                { threshold: 500, points: 20 },
                { threshold: 300, points: 10 }
            ])
        },
        {
            name: "好守備",
            value: stats.goodDefense,
            points: getHighestScore(stats.goodDefense, [
                { threshold: 900, points: 50 },
                { threshold: 600, points: 30 },
                { threshold: 300, points: 10 }
            ])
        },
        {
            name: "盗塁刺",
            value: stats.caughtStealing,
            points: getHighestScore(stats.caughtStealing, [
                { threshold: 500, points: 40 },
                { threshold: 300, points: 30 },
                { threshold: 200, points: 20 }
            ])
        }
    ];
}
// 投手の採点
function scorePitcher(data) {
    const stats = {
        wins: getStat(data, "勝利"),
        shutouts: getStat(data, "完封"),
        hp: getStat(data, "HP"),
        saves: getStat(data, "セーブ"),
        strikeouts: getStat(data, "奪三振")
    };
    return [
        {
            name: "勝利",
            value: stats.wins,
            points: getHighestScore(stats.wins, [
                { threshold: 200, points: 90 },
                { threshold: 150, points: 60 },
                { threshold: 100, points: 40 },
                { threshold: 50, points: 20 }
            ])
        },
        {
            name: "完封",
            value: stats.shutouts,
            points: getHighestScore(stats.shutouts, [
                { threshold: 50, points: 40 },
                { threshold: 30, points: 30 },
                { threshold: 10, points: 20 }
            ])
        },
        {
            name: "HP",
            value: stats.hp,
            points: getHighestScore(stats.hp, [
                { threshold: 400, points: 70 },
                { threshold: 300, points: 50 },
                { threshold: 200, points: 30 },
                { threshold: 100, points: 10 }
            ])
        },
        {
            name: "セーブ",
            value: stats.saves,
            points: getHighestScore(stats.saves, [
                { threshold: 300, points: 90 },
                { threshold: 200, points: 60 },
                { threshold: 100, points: 30 }
            ])
        },
        {
            name: "奪三振",
            value: stats.strikeouts,
            points: getHighestScore(stats.strikeouts, [
                { threshold: 3000, points: 30 },
                { threshold: 2000, points: 20 },
                { threshold: 1000, points: 10 }
            ])
        }
    ];
}
// ランク判定
function getRank(points) {
    if (points >= 100) return "ゴールド";
    if (points >= 70) return "シルバー";
    if (points >= 50) return "ブロンズ";
    return "ランク未到達";
}
// 入力データを解析して結果を表示
function analyzePlayer() {
    const input = document.getElementById("playerData");
    const data = input.innerText;
    const html = input.innerHTML;
    if (!data.trim()) {
        alert("選手情報を貼り付けてください。");
        return;
    }
    const info = getPlayerInfo(data, html);
    if (info.position === "不明") {
        alert("選手のポジションを判別できませんでした。");
        return;
    }
    // 守備位置を一文字に変換
    function getPositionShort(position) {
        const positions = {
            "外野手": "外",
            "内野手": "内",
            "捕手": "捕"
        };
        return positions[position] || "";
    }

    // 表彰歴を賞ごとに集計
    function getAwardCounts(data) {
        const normalized = normalizeCopiedData(data);
        const lines = normalized.split(/\r?\n/);
        const counts = {
             titleCount: 0,
            pitcherTitleCount: 0,
            // 共通表彰
            mvp: 0,
            b9: 0,
            gg: 0,
            distinguished: 0,
            rookie: 0,
            monthly: 0,
            // 野手タイトル
            batting: 0,
            hits: 0,
            homeRun: 0,
            rbi: 0,
            obp: 0,
            steals: 0,
            // 投手タイトル
            era: 0,
            winRate: 0,
            pitcherWins: 0,
            saves: 0,
            holds: 0,
            strikeouts: 0
        };
        const start = lines.findIndex(
            line => line.trim() === "表彰"
        );
        if (start === -1) return counts;
        for (let i = start + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (
                line.includes("野手情報") ||
                line.includes("投手情報")
            ) {
                break;
            }
            if (!line) continue;
            // 共通表彰
            if (line.includes("最優秀選手")) counts.mvp++;
            if (line.includes("ベストナイン")) counts.b9++;
            if (line.includes("ゴールデングラブ賞")) counts.gg++;
            if (line.includes("SBL最高殊勲選手")) counts.distinguished++;
            if (line.includes("新人王")) counts.rookie++;
            if (line.includes("月間MVP")) counts.monthly++;
            // 野手タイトル
            if (line.includes("首位打者賞")) counts.batting++;
            if (line.includes("最多安打者賞")) counts.hits++;
            if (
                line.includes("本塁打王") ||
                line.includes("最多本塁打者賞")
            ) counts.homeRun++;
            if (
                line.includes("打点王") ||
                line.includes("最多打点者賞")
            ) counts.rbi++;
            if (line.includes("最高出塁率者賞")) counts.obp++;
            if (line.includes("最多盗塁者賞")) counts.steals++;
            // 投手タイトル
            if (line.includes("最優秀防御率投手賞")) counts.era++;
            if (line.includes("勝率第一位投手賞")) counts.winRate++;
            if (line.includes("最多勝利投手賞")) counts.pitcherWins++;
            if (line.includes("最多セーブ投手賞")) counts.saves++;
            if (line.includes("最優秀中継ぎ投手賞")) counts.holds++;
            if (line.includes("最多三振奪取投手賞")) counts.strikeouts++;
        }
        // 野手の表彰合計（月間MVPを除く）
        counts.titleCount =
            counts.batting +
            counts.hits +
            counts.homeRun +
            counts.rbi +
            counts.obp +
            counts.steals +
            counts.mvp +
            counts.b9 +
            counts.gg +
            counts.distinguished +
            counts.rookie;
        // 投手の表彰合計（月間MVPを除く）
        counts.pitcherTitleCount =
            counts.era +
            counts.winRate +
            counts.pitcherWins +
            counts.saves +
            counts.holds +
            counts.strikeouts +
            counts.mvp +
            counts.b9 +
            counts.gg +
            counts.distinguished +
            counts.rookie;
        return counts;
    }
    // 野手のスプレッドシート登録データを作成
    function createBatterRow(data, info) {
        const awards = getAwardCounts(data);
        return [
                        "",                              // A 余白
            info.playerId,                   // B 選手ID
            info.retirementYear ?? "",       // C 引退年
            info.name,                       // D 表彰者名
            info.creator,                    // E 製作者名
            getPositionShort(info.position), // F 守
            getStatDecimal(data, "打率"),     // G 打率
            getStatDecimal(data, "出塁率"),   // H 出塁率
            getStat(data, "安打"),           // I 安打
            getStat(data, "本塁打"),         // J HR
            getStat(data, "打点"),           // K 打点
            getStat(data, "得点"),           // L 得点
            getStat(data, "盗塁"),           // M 盗塁
            getStat(data, "好守備"),         // N 好守
            awards.titleCount,              // O タイトル
            awards.mvp,                     // P MVP
            awards.b9,                      // Q B9
            awards.gg,                      // R GG
            awards.batting,                 // S 首位
            awards.hits,                    // T 安打
            awards.homeRun,                 // U 本塁打
            awards.rbi,                     // V 打点
            awards.obp,                     // W 出塁率
            awards.steals,                  // X 盗塁
            awards.distinguished,           // Y 殊勲
            awards.rookie,                  // Z 新人王
            awards.monthly                  // AA 月間
        ];
    }
    // 投手のスプレッドシート登録データを作成
    function createPitcherRow(data, info) {
        const awards = getAwardCounts(data);
        return [
                        "",                              // A 余白
            info.playerId,                       // B 選手ID
            info.retirementYear ?? "",           // C 引退年
            info.name,                           // D 表彰者名
            info.creator,                        // E 製作者名
            getStat(data, "勝利"),               // F 勝利
            getStat(data, "HP"),                 // G HP
            getStat(data, "セーブ"),             // H S
            getStat(data, "試合"),               // I 登板
            getInnings(data),                    // J 投球回
            getStatDecimal(data, "防御率"),      // K 防御率
            getStatDecimal(data, "WHIP"),        // L WHIP
            awards.pitcherTitleCount,            // M タイトル
            awards.mvp,                          // N MVP
            awards.b9,                           // O B9
            awards.gg,                           // P GG
            awards.era,                          // Q 防御率
            awards.winRate,                      // R 勝率
            awards.pitcherWins,                  // S 最多勝
            awards.saves,                        // T セーブ
            awards.holds,                        // U 中継
            awards.strikeouts,                   // V 奪三振
            awards.distinguished,                // W 殊勲
            awards.rookie,                       // X 新人王
            awards.monthly,                      // Y 月間
            ""                                   // Z 睦月賞
        ];
    }
    const eligibility = checkEligibility(info);
    const isBatter = ["捕手", "内野手", "外野手"].includes(
        info.position
    );
    const breakdown = isBatter
        ? scoreBatter(data)
        : scorePitcher(data);
    // スプレッドシート登録用のデータを作成
    const rowData = isBatter
        ? createBatterRow(data, info)
        : createPitcherRow(data, info);
    console.log("登録用データ:", rowData);
    // 生涯シンフォニアの加点
    if (eligibility.lifelong) {
        breakdown.push({
            name: "生涯シンフォニア",
            value: "該当",
            points: 10
        });
    }
    const total = breakdown.reduce(
        (sum, item) => sum + item.points,
        0
    );
    const rank = getRank(total);
    // 登録先のシート名を決定
    let sheetName = "";
    if (isBatter) {
        if (rank === "ゴールド") sheetName = "野手🥇";
        else if (rank === "シルバー") sheetName = "野手🥈";
        else if (rank === "ブロンズ") sheetName = "野手🥉";
    } else {
        if (rank === "ゴールド") sheetName = "投手🥇";
        else if (rank === "シルバー") sheetName = "投手🥈";
        else if (rank === "ブロンズ") sheetName = "投手🥉";
    }
    const result = document.getElementById("result");
    // ランクと資格の表示色
    const rankClass = {
        "ゴールド": "gold",
        "シルバー": "silver",
        "ブロンズ": "bronze",
        "ランク未到達": "unranked"
    }[rank];
    const eligibilityClass = eligibility.eligible
        ? "eligible"
        : "ineligible";
    result.innerHTML = `
        <div class="result-header">
            <h2>選考結果</h2>
            <h3>${info.name}</h3>
            <p>${info.position} ／ 背番号 ${info.jerseyNumber}</p>
        </div>
        <div class="eligibility-box ${eligibilityClass}">
            <span>受賞資格</span>
            <strong>
                ${eligibility.eligible ? "資格あり" : "資格なし"}
            </strong>
        </div>
        <div class="rank-box ${rankClass}">
            <p>獲得ランク</p>
            <h2>${rank}</h2>
            <div class="total-score">${total}<small> 点</small></div>
        </div>
        <h3 class="section-title">ポイント内訳</h3>
        <div class="score-list">
            ${breakdown.map(item => `
                <div class="score-item">
                    <span>${item.name}</span>
                    <span>${item.value}</span>
                    <strong>${item.points}点</strong>
                </div>
            `).join("")}
        </div>
        <div class="player-info">
            <h3>選手情報</h3>
            <p>製作者：${info.creator}</p>
            <p>選手ID：${info.playerId}</p>
            <p>引退年：${info.retirementYear ?? "現役・不明"}</p>
        </div>
        ${sheetName && eligibility.eligible ? `
            <button id="registerButton" class="register-button">
                スプレッドシートに登録
            </button>
        ` : `
            <p>${!eligibility.eligible ? "受賞資格がないため登録できません。" : "ランク未到達のため登録できません。"}</p>
        `}
    `;
    // 登録ボタンのクリック処理
    if (!eligibility.eligible || !sheetName) {
        return;
    }
    const registerButton = document.getElementById("registerButton");
    if (registerButton) {
        registerButton.addEventListener("click", async () => {
            registerButton.disabled = true;
            registerButton.textContent = "登録中...";
            try {
                const response = await fetch(SCRIPT_URL, {
                    method: "POST",
                    body: JSON.stringify({
                        sheetName: sheetName,
                        playerId: info.playerId,
                        rowData: rowData
                    })
                });
                const result = await response.json();
                alert(result.message);
            } catch (error) {
                alert("登録に失敗しました。通信環境を確認してください。");
                console.error(error);
            } finally {
                registerButton.disabled = false;
                registerButton.textContent = "スプレッドシートに登録";
            }
        });
    }
}