/* 中核5占術の「仮計算」エンジン(試作用)
 *
 * ここにあるのはすべて試作用の仮計算です。正式な計算は engine/official.js 側に
 * 用意し、切替は engine/index.js の1か所だけで行います。このファイルの中から
 * official.js を呼ぶことはありません。
 *
 * 守っていること:
 *  - 外部への通信を一切行わない(fetch / XMLHttpRequest を使わない)
 *  - 同一入力 → 同一結果(乱数・現在時刻を使わない、純粋な関数のみ)
 *  - 算命学を中心に据え、出力の項目数を最も多くする
 *  - 天中殺は算命学の内部要素として扱い、独立した占術にはしない
 *  - 断定・恐怖・依存を誘う表現、的中率の表示を行わない
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiProvisional = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============ 共通の小道具 ============ */

  function mod(n, m) { return ((n % m) + m) % m; }

  /** 1970-01-01 を 0 とした通日。時刻を含めないため同じ日付なら常に同じ値になる */
  function dayNumber(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  /** 'YYYY-MM-DD' を数値に分解する。形式が違うときは null を返す */
  function parseDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) { return null; }
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) { return null; }
    /* 2月30日のような存在しない日付を弾く */
    var probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
      return null;
    }
    return { year: y, month: mo, day: d, dayNo: dayNumber(y, mo, d) };
  }

  /** 立春(2月4日)を年の変わり目とする占術のための年 */
  function solarYear(b) {
    return (b.month < 2 || (b.month === 2 && b.day < 4)) ? b.year - 1 : b.year;
  }

  /* 漢数字。算命学の導入文で読み解き項目の数を数えるために使う */
  var KANJI_KAZU = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  /** 各桁を1桁になるまで足す。0 は 9 として扱う */
  function digitRoot(n) {
    var v = Math.abs(n);
    while (v > 9) {
      var s = 0;
      while (v > 0) { s += v % 10; v = Math.floor(v / 10); }
      v = s;
    }
    return v === 0 ? 9 : v;
  }

  /* ============ 1. 算命学(中心・最も厚く読む) ============ */

  var KAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  /* 仮の基準日。1984年2月2日を干支の起点(甲子)と置いた試作用の対応です。
     正式な暦との突き合わせは official.js 側で行います。 */
  var KANSHI_BASE = dayNumber(1984, 2, 2);

  /* 十大主星(仮に日干から一対一で対応させています) */
  var MAIN_STAR = ['貫索星', '石門星', '鳳閣星', '調舒星', '禄存星',
                   '司禄星', '車騎星', '牽牛星', '龍高星', '玉堂星'];
  /* 語り口(W8):算命学の note は「短文+補足」の2文構成で、結びは「〜と見ます。」に
     そろえる。占術ごとの文型の違いは tests/wording.spec.js の W8 検査が照合する */
  var MAIN_STAR_NOTE = [
    '一つの物事を自分の間合いで続ける型です。腰を据えるほど持ち味が出ると見ます。',
    '人の輪の中で周りに合わせて進む型です。仲間と組む場面で力が出ると見ます。',
    '目にしたものを楽しみに変える型です。肩の力を抜くほど働きが出ると見ます。',
    '感じたことを細やかに言葉へ移す型です。静かな場ほど言葉がよく出ると見ます。',
    '手元にあるものを人へ分ける型です。手渡す場面で持ち味が生きると見ます。',
    '身近なところを地道に整える型です。積み重ねが利く働きと見ます。',
    'まっすぐ動いて場を進める型です。迷いを置かない動きに強みが出ると見ます。',
    '筋を通して役目を果たす型です。任される場で背筋が伸びると見ます。',
    '知らない場所へ出て学びを持ち帰る型です。遠くへ出るほど身につくものが増える働きと見ます。',
    '学んだことを積み上げて筋道を立てる型です。調べ物に向く働きと見ます。'
  ];

  /* 十二支の主だった五行(蔵干の本気にあたる部分を簡略化した仮の対応) */
  var SHI_GOGYO = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  var GOGYO_NOTE = {
    '木': '伸びていく方向へ向かう気です。上へ育てる場面に向くと見ます。',
    '火': '明るいほうへ向かう気です。場を照らす役に向くと見ます。',
    '土': '足元を固めるほうへ向かう気です。土台づくりに向くと見ます。',
    '金': '形を整えるほうへ向かう気です。仕上げの場面に向くと見ます。',
    '水': '流れに合わせて動く気です。変化に添う場面に向くと見ます。'
  };

  /* 天中殺は算命学の内部の見方です。独立した占術としては扱いません。 */
  var TENCHUSATSU = ['戌亥', '申酉', '午未', '辰巳', '寅卯', '子丑'];

  /* KUBARI は value の並び(広く浅く/内から外へ/一点に集めて/身近な範囲へ)と
     意味を対応させる。旧文は3番目・4番目の note が value と食い違っていた
     (「一点に集めて」に「外の広い範囲へ」等)ため、改稿時に合わせて解消した */
  var KUBARI = [
    '力をまとめて出すより、広く少しずつ配る流れです。浅くとも行き渡らせるほうが保つと見ます。',
    '身近な人から順に、内から外へ気を配る流れです。順を追って広げると整うと見ます。',
    '気を一点に集めて注ぐ流れです。的を絞るほど遠くまで届くと見ます。',
    '気を身近な範囲へ戻して整える流れです。一人で静める時間が支えになると見ます。'
  ];
  var MAAI = [
    '相手との間にゆとりを置く型です。少し離れるほうが落ち着いて話せると見ます。',
    '近い距離で言葉を交わす型です。顔の見える間柄で力が出ると見ます。',
    '場面ごとに人といる時間と一人の時間を分ける型です。区切りをつけるほど整うと見ます。'
  ];
  var UGOKIDASHI = [
    '決めてから動くまでが早い型です。出足の軽さが持ち味と見ます。',
    '納得できるまで置いてから動く型です。温めた分だけ足取りが確かになると見ます。',
    '周りの様子を見てから合わせて動く型です。呼吸を合わせる巧さが出ると見ます。'
  ];

  /* cycle-0078(#55・工程5=切替):ここにあった DAY_KANSHI_NOTE(生まれた日の二文字の
     書き分けの文)を落とし、**「日の干支」の欄そのものを出さない形へ変えた**。
     ご指示 #55 は「読みを載せられない欄は表示しない。表示する欄には必ず読みを載せる。
     仕組みの断り書きは全廃する」であり、正式計算の側は二文字ごとの読み(KANSHI_YOMI)を
     持ったので欄を残せるが、**仮計算の側はその表を持てない**——CLAUDE.md の絶対条件
     「仮計算と正式計算はコード上分離」があり、こちらから official.js の表を引くと
     分離が崩れる(仮計算へ戻すという安全側の作りそのものが壊れる)。
     読みを載せられない以上、ご指示どおり欄を落とすのが筋である。
     欄が1つ減っても導入文は items.length から数を引いているので食い違わない。
     いま算命学は正式計算に切り替わっている(OFFICIAL_KEYS)ので、この欄は画面に
     出ていない。それでも落としたのは、万一 official が使えず仮計算へ戻ったときに
     断り書きだけが復活することを避けるためである。 */

  function sanmei(b) {
    var idx = mod(b.dayNo - KANSHI_BASE, 60);
    var kanIdx = idx % 10;
    var shiIdx = idx % 12;
    var gogyo = SHI_GOGYO[shiIdx];

    var items = [
        /* Issue #51(2026-08-06 オーナー指示):欄そのものの言い直しをやめ、その値が
           読み手にとって何を意味するかを述べる形へ書き替えた。official.js 側と同時に更新する
           (台帳 OC35a-L1 の二重管理) */
        /* cycle-0078:「日の干支」の欄はここから落とした(理由は上の注記) */
        { label: '中心の星', value: MAIN_STAR[kanIdx], note: MAIN_STAR_NOTE[kanIdx] },
        { label: '本元の気', value: gogyo, note: GOGYO_NOTE[gogyo] },
        { label: '気の配り方', value: ['広く浅く', '内から外へ', '一点に集めて', '身近な範囲へ'][idx % 4],
          note: KUBARI[idx % 4] },
        { label: '人との間合い', value: ['やや遠め', '近め', '場面で変える'][idx % 3],
          note: MAAI[idx % 3] },
        { label: '動き出しの型', value: ['先に動く', '確かめてから動く', '合わせて動く'][shiIdx % 3],
          note: UGOKIDASHI[shiIdx % 3] },
        { label: '天中殺の組', value: TENCHUSATSU[Math.floor(idx / 10)] + '天中殺',
          note: 'あなたにとって力が抜けやすい時期を、算命学ではこの呼び名で表します。悪い出来事の印ではなく、' +
                '無理をせず休みを挟む目安と見ます。' }
    ];

    return {
      key: 'sanmei',
      name: '算命学',
      view: '生まれ持った気の配り方',
      center: true,
      /* cycle-0078:「土台となる日の干支は「◯◯」」と名指ししていたが、その二文字を
         出す欄をこの回で落としたため、画面のどこにも無い値を導入文だけが語る形に
         なっていた。名指しをやめ、画面に実際にある「中心の星」から書き起こす */
      summary: '中心の星は「' +
               MAIN_STAR[kanIdx] + '」と出ています。ここを軸に、暮らしの手触りを' +
               (KANJI_KAZU[items.length] || items.length) + 'つの窓から眺めていきます。',
      closing: '気の配り方は季節のように移ろうものとされています。ここでの読み解きも、あなたを縛る決まりではなく、' +
               '遠くから眺める一枚の絵として置いていただけたらと思います。',
      items: items
    };
  }

  /* ============ 2. 九星気学 ============ */

  var KYUSEI_NAME = ['一白水星', '二黒土星', '三碧木星', '四緑木星', '五黄土星',
                     '六白金星', '七赤金星', '八白土星', '九紫火星'];
  var KYUSEI_IRO = ['白', '黒', '碧', '緑', '黄', '白', '赤', '白', '紫'];
  var KYUSEI_HOUI = ['北', '南西', '東', '南東', '中央', '北西', '西', '北東', '南'];
  /* 語り口(W8):九星の note は時間・巡りを主語に置き「この巡りでは、〜とされています。」の型 */
  var KYUSEI_NOTE = [
    'この巡りでは、流れに沿って動くうちに道が見えてくるとされています。',
    'この巡りでは、手間のかかる役を引き受けるほど信頼が積み上がるとされています。',
    'この巡りでは、思いついたことを先に口へ出すと物事が進みやすいとされています。',
    'この巡りでは、人と人をつなぐ役目が回ってきやすいとされています。',
    'この巡りでは、中心に置かれて任される場面が増えやすいとされています。',
    'この巡りでは、筋を通す姿勢がそのまま周りへ伝わりやすいとされています。',
    'この巡りでは、場を和ませる言葉がよく届くとされています。',
    'この巡りでは、積み重ねてきたものが変わり目で形になりやすいとされています。',
    'この巡りでは、目立つ場所へ押し出されやすいとされています。'
  ];

  /** 本命星(1〜9)。立春を年の変わり目とする */
  function honmei(b) {
    var star = 11 - digitRoot(solarYear(b));
    if (star > 9) { star -= 9; }
    if (star < 1) { star += 9; }
    return star;
  }

  /** 節入り(各月おおむね4日ごろ)を基準にした月。2月を1番目と数える */
  function setsuMonth(b) {
    var m = (b.day < 4) ? b.month - 1 : b.month;
    return mod(m - 2, 12) + 1;
  }

  /** 月命星。本命星を3組に分け、2月の始まりの星から1つずつ下る */
  function getsumei(b) {
    var h = honmei(b);
    var start = (h === 1 || h === 4 || h === 7) ? 8 : (h === 2 || h === 5 || h === 8) ? 5 : 2;
    return mod(start - 1 - (setsuMonth(b) - 1), 9) + 1;
  }

  function kyusei(b) {
    var h = honmei(b);
    var g = getsumei(b);
    return {
      key: 'kyusei',
      name: '九星気学',
      view: '年ごとの巡りと居場所',
      summary: '本命星は' + KYUSEI_NAME[h - 1] + '、月命星は' + KYUSEI_NAME[g - 1] +
               'です。九つの星が年ごとに座を移すなかで、いまのあなたの置かれ方を映す見方だと読み取れます。',
      closing: '巡りは止まらず、来年にはまた次の座へ移っていきます。いまの巡りを知る目安として、軽く携えていただけたらと思います。',
      items: [
        { label: '本命星', value: KYUSEI_NAME[h - 1], note: KYUSEI_NOTE[h - 1] },
        { label: '月命星', value: KYUSEI_NAME[g - 1],
          note: '生まれた月の巡りから見た星です。ふだんの過ごし方に出やすい面を映すとされています。' },
        /* cycle-0061:値ごとの読み解きを持たない二欄を書き分けにした。文は
           official.js 側と同じにすること(OC61-5 が両実装の一致まで見る) */
        { label: '星の色', value: KYUSEI_IRO[h - 1],
          note: 'この色は生まれた年から見た自分の星が決まればひとりでに決まります。あなたの読み解きは、上の「生まれた年から見た自分の星」に書いてあります。色そのものが人の性質を言い表しているわけではありません。' },
        { label: '定位の方角', value: KYUSEI_HOUI[h - 1],
          note: 'この方角も生まれた年から見た自分の星と一対一で決まります。読むところは色の欄と同じで、上の「生まれた年から見た自分の星」に書いてあります。方角そのものに良し悪しがあるわけではありません。' }
      ]
    };
  }

  /* ============ 3. 数秘術 ============ */

  /* 語り口(W8):数秘の note は数そのものを主語に置き「〜ようです。」で結ぶ */
  var LIFEPATH_NOTE = {
    1: '1という数は、自分で決めて先へ進む動きにつながるようです。',
    2: '2という数は、相手の様子を受け取って合わせる力につながるようです。',
    3: '3という数は、思いつきを形にして楽しむ力につながるようです。',
    4: '4という数は、手順を整えて積み上げる力につながるようです。',
    5: '5という数は、場所や環境の変わり目で力を引き出すようです。',
    6: '6という数は、身近な人の世話を引き受ける場面を増やすようです。',
    7: '7という数は、一人で調べて掘り下げる時間を求めるようです。',
    8: '8という数は、大きな流れをまとめる役目を引き寄せるようです。',
    9: '9という数は、広く行き渡らせる方向へ気を向かわせるようです。',
    11: '11という数は、感じ取ったことをそのまま人へ伝えやすくするようです。',
    22: '22という数は、大きな形へまとめ上げる働きにつながるようです。',
    33: '33という数は、損得から離れて人へ手を貸す働きにつながるようです。'
  };

  /** ゾロ目(11・22・33)はそのまま残す数秘術の作法にならう */
  function reduceKeepMaster(n) {
    var v = n;
    while (v > 9 && v !== 11 && v !== 22 && v !== 33) {
      var s = 0, t = v;
      while (t > 0) { s += t % 10; t = Math.floor(t / 10); }
      v = s;
    }
    return v;
  }

  function suuhi(b) {
    var all = String(b.year) + String(b.month) + String(b.day);
    var sum = 0;
    for (var i = 0; i < all.length; i++) { sum += Number(all.charAt(i)); }
    var life = reduceKeepMaster(sum);
    var birth = reduceKeepMaster(b.day);
    var master = (life === 11 || life === 22 || life === 33);

    return {
      key: 'suuhi',
      name: '数秘術',
      view: '数に置きかえた性質',
      summary: (master
        ? '生年月日の数字を足していくと「' + life + '」が現れます。同じ数が重なる並びは、それ以上足し進めずにそのまま読む作法があります。'
        : '生年月日の数字を足しつづけると「' + life + '」にたどり着きます。') +
        '誕生数「' + birth + '」との取り合わせから、日々の選び方に出る癖が浮かび上がると読み取れます。',
      closing: '数はその人のすべてを言い当てる物差しではありません。合うと感じたところだけを、そっと持ち帰っていただけたらと思います。',
      items: [
        { label: 'ライフパスナンバー', value: String(life), note: LIFEPATH_NOTE[life] },
        { label: '誕生数', value: String(birth),
          note: '誕生数は生まれた日そのものから出る数です。ふだん表に出やすい面を映すようです。' },
        { label: '数の性質', value: master ? 'ゾロ目の数' : (life % 2 === 0 ? '偶数の数' : '奇数の数'),
          note: master ? '同じ数が重なる並びです。この数は力の出し方に波が出るようです。'
                       : (life % 2 === 0 ? '偶数という数は、周りとつり合いを取る動き方へ寄せるようです。'
                                         : '奇数という数は、自分から先に動く動き方へ寄せるようです。') },
        { label: '数の重なり', value: (life === birth ? '重なっている' : '離れている'),
          note: (life === birth
            ? '生き方の数と生まれた日の数が同じ組み合わせです。二つの数は向きをそろえやすいようです。'
            : '生き方の数と生まれた日の数が違う組み合わせです。場面によって前へ出る数が替わるようです。') }
      ]
    };
  }

  /* ============ 4. 西洋占星術 ============ */

  /* 星座の境目は年によって前後します。ここでは代表的な日付で区切った仮の対応です。 */
  var SIGNS = [
    { name: '山羊座', from: [1, 1] },  { name: '水瓶座', from: [1, 20] },
    { name: '魚座', from: [2, 19] },   { name: '牡羊座', from: [3, 21] },
    { name: '牡牛座', from: [4, 20] }, { name: '双子座', from: [5, 21] },
    { name: '蟹座', from: [6, 22] },   { name: '獅子座', from: [7, 23] },
    { name: '乙女座', from: [8, 23] }, { name: '天秤座', from: [9, 23] },
    { name: '蠍座', from: [10, 24] },  { name: '射手座', from: [11, 22] },
    { name: '山羊座', from: [12, 22] }
  ];
  /* 牡羊座からの並び順での属性 */
  var SIGN_ORDER = ['牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座',
                    '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座'];
  var ELEMENT = ['火', '地', '風', '水'];
  var MODE = ['活動', '不動', '柔軟'];
  /* cycle-0087(台帳 YOMI-4):エレメントと三区分の読みは index.js の VALUE_NOTE へ移した
     (official.js 側と同じ処置。同じ文を二重に持っていたのを1か所へ寄せた) */

  function sunSign(b) {
    var name = SIGNS[0].name;
    for (var i = 0; i < SIGNS.length; i++) {
      var f = SIGNS[i].from;
      if (b.month > f[0] || (b.month === f[0] && b.day >= f[1])) { name = SIGNS[i].name; }
    }
    return name;
  }

  function seiyou(b) {
    var name = sunSign(b);
    var order = SIGN_ORDER.indexOf(name);
    var el = ELEMENT[order % 4];
    var md = MODE[order % 3];

    return {
      key: 'seiyou',
      name: '西洋占星術',
      view: '空の配置から見た傾向',
      summary: '生まれた日、太陽はおおよそ' + name + 'のあたりにあったと見立てます。' + el + 'の性質と' + md +
               'の型の重なりから、力の出やすい場面を探っていきます。',
      closing: '空の配置は生まれた瞬間の眺めであって、これからの道筋を定めるものではありません。星空を見上げるつもりで読んでいただけたらと思います。',
      items: [
        { label: '太陽星座', value: name,
          /* cycle-0065(台帳 OC58-L1):求め方の説明は about が持つ。
             cycle-0087:境目の日の断りも about へ移したので、ここは空にする */
          note: '' },
        /* Issue #51:値の語尾を平易にした(「のグループ」→「の性質」/「のしるし」→「の型」)。
           火・地・風・水と活動・不動・柔軟の語そのものと添字の対応は変えていない。
           cycle-0087:読みは index.js の VALUE_NOTE が持つのでここは空にする */
        { label: 'エレメント', value: el + 'の性質', note: '' },
        { label: '三区分', value: md + 'の型', note: '' },
        /* cycle-0065(台帳 OC60-L1):求め方は about、読み解きは VALUE_NOTE が持つ。
           official.js の同じ欄と同じく空にする(OC60-6 が両実装の一致を見る) */
        { label: '向かい合う星座', value: SIGN_ORDER[(order + 6) % 12], note: '' }
      ]
    };
  }

  /* ============ 5. 宿曜 ============ */

  var SHUKU = ['昴宿', '畢宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '張宿',
               '翼宿', '軫宿', '角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿',
               '斗宿', '女宿', '虚宿', '危宿', '室宿', '壁宿', '奎宿', '婁宿', '胃宿'];
  /* 正式には旧暦の月の位置から求めます。ここでは通日から割り出した仮の対応です。 */
  var SHUKU_BASE = dayNumber(1984, 2, 2);
  var SHUKU_KEITOU = ['和', '栄', '静'];
  /* 語り口(W8):宿曜の note は対人場面(人と/相手と)から入る */
  var SHUKU_KEITOU_NOTE = {
    '和': '人と向き合う場では、相手に合わせて場をなだらかにする向き合い方になりやすいと読み取れます。',
    '栄': '人の集まる場では、前に出て輪を広げる向き合い方になりやすいと読み取れます。',
    '静': '人と交わる場では、一歩引いて全体を眺める向き合い方になりやすいと読み取れます。'
  };

  function sukuyo(b) {
    var i = mod(b.dayNo - SHUKU_BASE, 27);
    var kei = SHUKU_KEITOU[i % 3];
    return {
      key: 'sukuyo',
      name: '宿曜',
      /* cycle-0064(監査 R6):以前は「月の巡りと人との相性」だった。同じ画面の
         「二十七のうちの何番目か」で「二人の距離を数えることはしていない」と述べる以上、
         見出しの側で相性を名乗ると読み手はどちらが本当か分からなくなる */
      view: '月の巡りから読む人との向き合い方',
      summary: '生まれた夜、月は' + SHUKU[i] + 'に宿っていたと見立てます。' + kei +
               'の型の向き合い方が、人との間にどう出るかを眺める見方です。',
      closing: '宿は月の通り道を二十七に分けて名づけた古い呼び名です。人と向き合うときの静かな手がかりの一つとして、そばに置いていただけたらと思います。',
      /* 語り口(W8):宿曜の note は「人」か「相手」から始める。Issue #51 で、欄そのものの
         言い直しで終わっていた note を読み手向けの文へ書き替え、「系統」「区分」の語も外した */
      items: [
        /* cycle-0059(台帳 OC58-1):正式計算と同じ書き分け。文が食い違うと切替のたびに
           片方だけ古くなる(台帳 OC48-L1)ので、OC59-5 が両実装の文の一致も見ている */
        { label: '生まれの宿', value: SHUKU[i],
          note: '人とどう向き合いやすいかは、この宿を出発点にして読み解いていきます。あなたの場合にどんな向き合い方になりやすいかは、下の「人との付き合い方の型」に書いてあります。' },
        { label: '宿の系統', value: kei + 'の型', note: SHUKU_KEITOU_NOTE[kei] },
        /* cycle-0064(台帳 OC58-2 の #12):以前の文は「あなたの番号が分かると、
           相手との巡り合わせをたどる手がかりになります。」だったが、この画面には
           相手の生年月日を入れる手立てが無く、果たせない約束だった(cycle-0059 の
           監査 R1)。約束を実態へ直したうえで、行き先を「人との付き合い方の型」へ
           名指しする。official.js の CYCLE_POS_NOTE と同一文(OC64-5 が見る) */
        { label: '巡りの位置', value: (i + 1) + ' / 27',
          note: '人との間柄を数えるための番号ではなく、二十七を並べた輪の上であなたの居場所がどこかを指すものです。' +
                'このアプリは二人ぶんの生まれた日を同時に受け取る欄を持たないので、二人の距離を数えることはしていません。' +
                'あなたの向き合い方そのものは、上の「人との付き合い方の型」に書いてあります。' },
        { label: '人との調子', value: ['合わせやすい', '刺激になりやすい', '学び合いやすい'][i % 3],
          note: '相手と向き合うときに出やすい流れです。合う合わないを決めつけるものではないと考えています。' }
      ]
    };
  }

  /* ============ 追加占術:姓名判断(画数・Issue #26) ============
   *
   * 中核5占術とは別の「追加占術」。生年月日ではなく「占いたい名前」(任意入力・
   * ニックネーム可・本名を求めない)から計算する。総合占い(computeOverall)には
   * 加えない(総合は中核5占術のみで組む)。
   * 商標登録されている占術の名称・固有用語は使わない(cycle-0021 調査。詳細は CLAUDE.md)。
   *
   * 画数の数え方(試作用の簡易換算):
   *  - ひらがな・カタカナは一般的な画数表のとおり(濁点+2画・半濁点+1画)
   *  - それ以外の文字(漢字・英数など)は文字コードから決める試作用の換算値
   *    (同じ文字なら常に同じ値=決定論的)。正式な字画辞典は official.js 側の課題
   *  - 空白は数えない
   */

  var KANA_STROKES = {
    'あ': 3, 'い': 2, 'う': 2, 'え': 2, 'お': 3,
    'か': 3, 'き': 4, 'く': 1, 'け': 3, 'こ': 2,
    'さ': 3, 'し': 1, 'す': 2, 'せ': 3, 'そ': 1,
    'た': 4, 'ち': 2, 'つ': 1, 'て': 1, 'と': 2,
    'な': 4, 'に': 3, 'ぬ': 2, 'ね': 2, 'の': 1,
    'は': 3, 'ひ': 1, 'ふ': 4, 'へ': 1, 'ほ': 4,
    'ま': 3, 'み': 2, 'む': 3, 'め': 2, 'も': 3,
    'や': 3, 'ゆ': 2, 'よ': 2,
    'ら': 2, 'り': 2, 'る': 1, 'れ': 2, 'ろ': 1,
    'わ': 2, 'ゐ': 1, 'ゑ': 1, 'を': 3, 'ん': 1,
    'ぁ': 3, 'ぃ': 2, 'ぅ': 2, 'ぇ': 2, 'ぉ': 3,
    'ゃ': 3, 'ゅ': 2, 'ょ': 2, 'っ': 1,
    'ア': 2, 'イ': 2, 'ウ': 3, 'エ': 3, 'オ': 3,
    'カ': 2, 'キ': 3, 'ク': 2, 'ケ': 3, 'コ': 2,
    'サ': 3, 'シ': 3, 'ス': 2, 'セ': 2, 'ソ': 2,
    'タ': 3, 'チ': 3, 'ツ': 3, 'テ': 3, 'ト': 2,
    'ナ': 2, 'ニ': 2, 'ヌ': 2, 'ネ': 4, 'ノ': 1,
    'ハ': 2, 'ヒ': 2, 'フ': 1, 'ヘ': 1, 'ホ': 4,
    'マ': 2, 'ミ': 3, 'ム': 2, 'メ': 2, 'モ': 3,
    'ヤ': 2, 'ユ': 2, 'ヨ': 3,
    'ラ': 2, 'リ': 2, 'ル': 2, 'レ': 1, 'ロ': 3,
    'ワ': 2, 'ヰ': 3, 'ヱ': 3, 'ヲ': 3, 'ン': 2,
    'ァ': 2, 'ィ': 2, 'ゥ': 3, 'ェ': 3, 'ォ': 3,
    'ャ': 2, 'ュ': 2, 'ョ': 3, 'ッ': 3,
    'ー': 1
  };

  /** 1文字ぶんの画数(試作用)。同じ文字なら常に同じ値を返す */
  function charStrokes(ch) {
    if (Object.prototype.hasOwnProperty.call(KANA_STROKES, ch)) { return KANA_STROKES[ch]; }
    /* が・ぱ 等は「もとの字+濁点/半濁点」に分けてから数える */
    if (typeof ch.normalize === 'function') {
      var parts = ch.normalize('NFD');
      if (parts.length > 1) {
        var base = parts.charAt(0);
        if (Object.prototype.hasOwnProperty.call(KANA_STROKES, base)) {
          var extra = 0;
          for (var i = 1; i < parts.length; i++) {
            var code = parts.charCodeAt(i);
            if (code === 0x3099) { extra += 2; }       /* 濁点 */
            else if (code === 0x309A) { extra += 1; }  /* 半濁点 */
          }
          return KANA_STROKES[base] + extra;
        }
      }
    }
    /* かな以外(漢字・英数など)の試作用の換算値。3〜29画の範囲に収める */
    return (ch.codePointAt(0) % 27) + 3;
  }

  /** 名前の空白を除いた文字の並び(サロゲートペアも1文字として扱う)。
      見た目が同じ名前は内部表現が違っても同じ結果になるよう、先に NFKC で
      そろえる(「か+結合濁点」→「が」、半角カナ→全角カナ。監査 cycle-0025 M1/L4) */
  function seimeiChars(name) {
    var out = [];
    var text = String(name || '');
    if (typeof text.normalize === 'function') { text = text.normalize('NFKC'); }
    for (var i = 0; i < text.length;) {
      var cp = text.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      i += ch.length;
      if (/\s/.test(ch)) { continue; }
      out.push(ch);
    }
    return out;
  }

  /* 画の型(総画を一桁に畳んだ1〜9)。語り口(W8):姓名判断の note は
     名前・画数を主語に置き「〜と映ります。」で結ぶ(他の5占術の文型と重ねない) */
  var KAKU_KATA_NOTE = [
    'ひと筆で線を引くように、迷いを残さず進む振る舞いが似合う名前と映ります。',
    '二つの点が支え合うように、誰かと組んで進む場面がなじむ名前と映ります。',
    '三方へ枝が伸びるように、思いつきを外へ広げる動きが似合う名前と映ります。',
    '四隅のそろった箱のように、こつこつ積み上げる過ごし方がなじむ名前と映ります。',
    '五指を開いて風を受けるように、変わり目を面白がる身のこなしが似合う名前と映ります。',
    '六つの面が組み合う立方のように、身近な人を受け止める役回りがなじむ名前と映ります。',
    '七日ごとに区切りを引くように、一人で深く調べる時間が似合う名前と映ります。',
    '八方へ道が延びるように、大きな流れをまとめる役回りがなじむ名前と映ります。',
    '九つの升を満たすように、行き渡らせて締めくくる動きが似合う名前と映ります。'
  ];

  function seimei(name) {
    var chars = seimeiChars(name);
    if (chars.length === 0) { return null; }

    var total = 0;
    var strokes = [];
    for (var i = 0; i < chars.length; i++) {
      var s = charStrokes(chars[i]);
      strokes.push(s);
      total += s;
    }
    var kata = digitRoot(total);
    var head = strokes[0];
    var tail = strokes[strokes.length - 1];

    return {
      key: 'seimei',
      name: '姓名判断',
      view: '名前の画数から見た印象',
      summary: '「' + chars.join('') + '」という名前を画数に置きかえると、合わせて' + total +
               '画になります。かな以外の文字は試作用の簡易換算で数えています。' +
               '画の重なりから、名前がまとう雰囲気を眺めていきます。',
      closing: '姓名判断が見ているのは、名前という持ち物の一つの側面にすぎません。' +
               '呼ばれて心地よい響きであることをいちばんに数えて、軽やかに受け取っていただけたらと思います。',
      items: [
        /* cycle-0064(台帳 OC58-2 の #9):この欄も値が多数に分かれるのに「あなたの
           場合」の文が1通りしかなかった(「名前がまとう雰囲気の土台と映ります。」で
           欄の役割だけ)。画数ごとの意味の原典は手元に無く、書き起こせば #45 違反に
           なるので「足す」道は取れない。一方で行き先は実在する=実装はこの合計を
           一けたになるまで足し縮めて画の型を出しており(kata)、その欄は
           KAKU_KATA_NOTE で9通りに分かれる読み解きを持つ。画面では下に並ぶ */
        { label: '総画', value: total + '画',
        /* 語り口(OC26):姓名判断の note は「〜と映ります。」で結ぶ決まり
           (tests/seimei.spec.js。他の5占術の文末を借りないための取り決め) */
          note: 'この数は、一けたになるまで足し縮めてから読み解きに使います。' +
                'あなたの名前がまとう雰囲気は、下の「画数を一けたに縮めた数」に書いてあります。' +
                '合計そのものの大小を良し悪しとして見るところではなく、そこへつなぐ入り口と映ります。' },
        { label: '画の型', value: KANJI_KAZU[kata] + 'の型', note: KAKU_KATA_NOTE[kata - 1] },
        { label: '頭字の画', value: head + '画',
          note: (head % 2 === 1
            ? '最初の字の画数が奇数の名前は、外へ向かって開く出だしと映ります。'
            : '最初の字の画数が偶数の名前は、そっと整えて入る出だしと映ります。') },
        { label: '結字の画', value: tail + '画',
          note: (tail % 2 === 1
            ? '最後の字の画数が奇数の名前は、余韻を残して締めくくる結びと映ります。'
            : '最後の字の画数が偶数の名前は、静かにそろえて閉じる結びと映ります。') }
      ]
    };
  }

  /* ============ 総合占い(C6):5占術の重なりと食い違い ============ */

  /* 総合占いは個別占術の文の再掲・連結にしない。判定は各占術の既存の計算値を
     「動き出し方」「人との間合い」の2軸に写して数え、多数派を一致点、
     少数派を相違点として文章を独自に組み立てる。文言もすべてここで独自に持ち、
     個別5占術の文と1文も重ならないようにする(tests/overall.spec.js が走査で確認)。 */

  var OVERALL_AXES = [
    {
      key: 'ugoki',
      label: '動き出し方',
      cats: [
        { value: '先へ動く流れ', phrase: '思い立ったら早めに一歩を出す' },
        { value: '確かめる流れ', phrase: '自分で納得してから動き出す' },
        { value: '合わせる流れ', phrase: '周りに合わせて進む速さを決める' }
      ]
    },
    {
      key: 'maai',
      label: '人との間合い',
      cats: [
        { value: '近づく間合い', phrase: '近い距離で言葉を交わしながら深める' },
        { value: '見渡す間合い', phrase: '少し離れた場所から全体を見渡す' },
        { value: '変える間合い', phrase: '相手や場面ごとに距離を取り直す' }
      ]
    }
  ];

  /* 九星の本命星(1〜9)を動き出しの型に写す仮の対応。KYUSEI_NOTE の各星の説明文と
     向きが矛盾しないように選んである(例:三碧「先に口に出す」→ 先へ動く) */
  var KYUSEI_UGOKI = [2, 1, 0, 2, 0, 1, 2, 1, 0];
  /* 西洋の四元素(火・地・風・水)を間合いに写す仮の対応(火風=近づく、地=見渡す、水=変える) */
  var ELEMENT_MAAI = [0, 1, 0, 2];

  /** 各占術の計算値を2軸の型(0/1/2)に写す。個別の文と向きが食い違わない対応を選ぶ */
  function overallStances(b) {
    var idx = mod(b.dayNo - KANSHI_BASE, 60);
    var shiIdx = idx % 12;
    var h = honmei(b);
    var g = getsumei(b);
    var all = String(b.year) + String(b.month) + String(b.day);
    var sum = 0;
    for (var i = 0; i < all.length; i++) { sum += Number(all.charAt(i)); }
    var life = reduceKeepMaster(sum);
    var birth = reduceKeepMaster(b.day);
    var master = (life === 11 || life === 22 || life === 33);
    var order = SIGN_ORDER.indexOf(sunSign(b));
    var s = mod(b.dayNo - SHUKU_BASE, 27);

    return [
      /* 算命学:動き出しの型(UGOKIDASHI)と人との間合い(MAAI)の並びに合わせる */
      { name: '算命学', ugoki: shiIdx % 3, maai: [1, 0, 2][idx % 3] },
      { name: '九星気学', ugoki: KYUSEI_UGOKI[h - 1], maai: (g - 1) % 3 },
      /* 数秘術:奇数=自分から先に、偶数=周りとつり合い。ゾロ目は「数の性質」の
         note が言う『力の出し方に波が出る』に合わせ、波が引くのを待ってから
         動き出す=確かめる型(1)に写す(監査E7:根拠の書き直し) */
      { name: '数秘術', ugoki: master ? 1 : (life % 2 === 1 ? 0 : 2), maai: birth % 3 },
      /* 西洋:三区分(活動・不動・柔軟)がそのまま動き出しの3型に対応する */
      { name: '西洋占星術', ugoki: order % 3, maai: ELEMENT_MAAI[order % 4] },
      /* 宿曜:系統(和・栄・静)は個別画面で「人との間にどう流れるか」として説明している
         対人の見方なので、間合い(maai)に写す。和=相手に合わせて距離を取り直す→変える、
         栄=前に出て広げる→近づく、静=一歩引いて全体を眺める→見渡す。
         動き出し(ugoki)は巡りの位置(前半/中盤/後半)から写す。 */
      { name: '宿曜', ugoki: Math.floor(s / 9) % 3, maai: [2, 0, 1][s % 3] }
    ];
  }

  /** 1軸ぶんの集計。最多の型(同数なら先頭側)と、それ以外の型ごとの内訳を返す */
  function tallyAxis(stances, axisKey) {
    var counts = [0, 0, 0];
    var names = [[], [], []];
    for (var i = 0; i < stances.length; i++) {
      var c = stances[i][axisKey];
      counts[c]++;
      names[c].push(stances[i].name);
    }
    var top = 0;
    for (var j = 1; j < 3; j++) { if (counts[j] > counts[top]) { top = j; } }
    var minors = [];
    for (var k = 0; k < 3; k++) {
      if (k !== top && counts[k] > 0) { minors.push({ cat: k, count: counts[k], names: names[k] }); }
    }
    minors.sort(function (a, b) { return b.count - a.count || a.cat - b.cat; });
    return { top: top, count: counts[top], names: names[top], minors: minors };
  }

  /**
   * 総合占い。5占術の一致点・相違点をまとめた上位の読み物を組み立てる。
   * 個別占術と同じく決定論的(同一入力→同一結果)。
   * @param {{birthdate:string}} input
   * @returns {object|null} 計算できないときは null
   */
  function computeOverall(input) {
    var b = parseDate(input && input.birthdate);
    if (!b) { return null; }
    var stances = overallStances(b);
    var t0 = tallyAxis(stances, 'ugoki');
    var t1 = tallyAxis(stances, 'maai');

    /* 重なりが強い軸を「重なって見えるところ」、もう一方を「食い違って見えるところ」に使う */
    var agreeIdx = (t1.count > t0.count) ? 1 : 0;
    var agreeAxis = OVERALL_AXES[agreeIdx];
    var agreeT = (agreeIdx === 0) ? t0 : t1;
    var differAxis = OVERALL_AXES[1 - agreeIdx];
    var differT = (agreeIdx === 0) ? t1 : t0;

    function join(list) { return list.join('・'); }
    var agreeCat = agreeAxis.cats[agreeT.top];

    var agreeBody = [];
    if (agreeT.count >= 3) {
      agreeBody.push(agreeAxis.label + 'をめぐっては、' + join(agreeT.names) + 'の' +
        KANJI_KAZU[agreeT.count] + 'つの見方が「' + agreeCat.phrase + '」という向きで重なっています。');
      agreeBody.push('複数の見方をまたいで浮かび上がるこの重なりは、あなたの持ち味の芯に近い部分だと読み取れます。');
    } else {
      /* 5票が3型に割れて最多が2票のときは必ず (2,2,1) の分布になり、同数の組が
         もう一つ存在する。「最も近くに寄っています」では実態とずれるため、
         二手に分かれている事実をそのまま書く(監査E6) */
      agreeBody.push(agreeAxis.label + 'をめぐっては、五つの見方が二つ・二つ・一つと別の向きに分かれており、そのうち' +
        join(agreeT.names) + 'は「' + agreeCat.phrase + '」という向きで並んでいます。');
      /* 「寄り合い」は本来は集会の意で比喩として紛らわしいため使わない(監査E9) */
      agreeBody.push('同じ数だけ別の向きへ寄る組み合わせもあるため、はっきりした芯というより、いくつかの小さなまとまりが並んでいる状態だと読み取れます。');
    }

    var differBody = [];
    var differCat = differAxis.cats[differT.top];
    if (differT.minors.length === 0) {
      /* official.js の同じ分岐と同じ理由で書き換え(禁止語 /当た(る|り)ま/ と
         です・ます調の検査を通る形に統一する。仮計算では現在この分岐に到達しないが、
         5占術のどれかが仮計算へ戻ったときの受け皿なので同じ文言に揃えておく) */
      differBody.push('今回の入力では、' + differAxis.label + 'についても五つの見方の向きが珍しいほどそろっており、大きな食い違いは見えていません。');
      differBody.push('それでも占術ごとに照らす場所は違うため、個別の読み解きにはそれぞれ別の景色が残っています。');
    } else {
      differBody.push('いっぽう' + differAxis.label + 'に目を移すと、見方ごとの違いが出ています。');
      differBody.push(join(differT.names) + 'は「' + differCat.phrase + '」という向きに寄っていますが、' +
        join(differT.minors[0].names) + 'は「' + differAxis.cats[differT.minors[0].cat].phrase + '」という向きです。');
      if (differT.minors.length >= 2) {
        differBody.push('さらに' + join(differT.minors[1].names) + 'からは「' +
          differAxis.cats[differT.minors[1].cat].phrase + '」という向きも読み取れます。');
      }
      differBody.push('どれかが本当の姿というより、場面に応じて出る顔が入れ替わるのだと読み取れます。');
    }

    return {
      key: 'overall',
      name: '総合占い',
      view: '五つの見方の重なり',
      heading: '五つの見方を重ねて',
      summary: '五つの読み解きを一枚に重ねると、そろって同じ向きを指すところと、それぞれ別の向きを指すところが見えてきます。' +
               'ここでは「動き出し方」と「人との間合い」の二つの軸から、その重なりと食い違いを眺めていきます。',
      sections: [
        { heading: '重なって見えるところ(一致点)', body: agreeBody },
        { heading: '食い違って見えるところ(相違点)', body: differBody }
      ],
      /* ラベルは個別占術(算命学の「人との間合い」等)と重ねない。総合は多数派の
         「寄り」を示すもので、個別の値と向きが違っても矛盾ではないため、名前でも
         区別する(監査E8) */
      /* 最多がちょうど2票のときは (2,2,1) の割れた分布なので、note も本文の弱さに
         合わせて「わずかに寄っている」程度に抑える(監査E10)。最多は必ず2票以上 */
      items: [
        { label: '動き出しの寄り', value: OVERALL_AXES[0].cats[t0.top].value,
          note: (t0.count === 2)
            ? '五つの見方のうち' + KANJI_KAZU[t0.count] + 'つがわずかにこの向きへ寄っています。強い流れではないため、迷ったときの軽い目安にとどめていただけたらと思います。'
            : '五つの見方のうち' + KANJI_KAZU[t0.count] + 'つがこの向きを指しており、迷ったときの最初の一歩の目安になると読み取れます。' },
        { label: '間合いの寄り', value: OVERALL_AXES[1].cats[t1.top].value,
          note: (t1.count === 2)
            ? '人との距離の取り方は、' + KANJI_KAZU[t1.count] + 'つの見方がわずかにこの向きへ寄っている程度です。決め手ではなく、ゆるやかな手がかりとして携えていただけたらと思います。'
            : '人との距離の取り方としては、' + KANJI_KAZU[t1.count] + 'つの見方がこの向きに寄っており、疲れたときに戻る足場になると読み取れます。' }
      ],
      closing: '総合の読み解きは、五つの見方の多数決で答えを一つに決めるためのものではありません。' +
               '重なりは芯として、食い違いは幅として、どちらもあなたの持ち物と数えていただけたらと思います。',
      provisional: true,
      notice: '現在は試作用の仮データです。'
    };
  }

  /* ============ まとめ ============ */

  var CALCULATORS = {
    sanmei: sanmei,
    kyusei: kyusei,
    suuhi: suuhi,
    seiyou: seiyou,
    sukuyo: sukuyo
  };

  /* プルダウンに並べる順。算命学を先頭に置く。
     天中殺などの内部要素はここに含めない。
     追加占術(EXTRA_ORDER)は中核5占術の後ろに並べ、総合占いには加えない。 */
  var ORDER = ['sanmei', 'kyusei', 'suuhi', 'seiyou', 'sukuyo'];
  var EXTRA_ORDER = ['seimei'];

  /**
   * 1占術を仮計算する。
   * @param {string} key 占術キー
   * @param {{birthdate?:string, seimeiName?:string}} input
   *   中核5占術は birthdate、姓名判断は seimeiName(任意入力の名前)を使う
   * @returns {object|null} 計算できないときは null
   */
  function computeOne(key, input) {
    /* 姓名判断(追加占術)は生年月日でなく「占いたい名前」から計算する */
    if (key === 'seimei') {
      var result2 = seimei(input && input.seimeiName);
      if (!result2) { return null; }
      result2.provisional = true;
      result2.notice = '現在は試作用の仮データです。';
      return result2;
    }
    var calc = CALCULATORS[key];
    if (!calc) { return null; }
    var b = parseDate(input && input.birthdate);
    if (!b) { return null; }
    var result = calc(b);
    result.provisional = true;
    result.notice = '現在は試作用の仮データです。';
    return result;
  }

  /** 5占術すべてを仮計算する */
  function computeAll(input) {
    var out = {};
    for (var i = 0; i < ORDER.length; i++) {
      out[ORDER[i]] = computeOne(ORDER[i], input);
    }
    return out;
  }

  return {
    mode: 'provisional',
    order: ORDER.slice(),
    extraOrder: EXTRA_ORDER.slice(),
    computeOne: computeOne,
    computeAll: computeAll,
    computeOverall: computeOverall,
    /* 検証と再利用のために公開する純粋関数 */
    util: { parseDate: parseDate, digitRoot: digitRoot, honmei: honmei, sunSign: sunSign,
            charStrokes: charStrokes, seimeiChars: seimeiChars }
  };
});
