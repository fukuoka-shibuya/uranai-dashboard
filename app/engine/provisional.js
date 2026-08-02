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
  var MAIN_STAR_NOTE = [
    '一つの物事を自分の間合いで続けていく型が出ていると読み取れます。',
    '人の輪の中で調子を合わせながら進む型が出ていると読み取れます。',
    '目にしたものを楽しみに変えていく型が出ていると読み取れます。',
    '感じたことを細やかに言葉にしていく型が出ていると読み取れます。',
    '手元にあるものを人に分けていく型が出ていると読み取れます。',
    '身近なところを地道に整えていく型が出ていると読み取れます。',
    'まっすぐ動いて場を進めていく型が出ていると読み取れます。',
    '筋を通して役目を果たしていく型が出ていると読み取れます。',
    '知らない場所へ出て学びを持ち帰る型が出ていると読み取れます。',
    '学んだことを積み上げて筋道を立てる型が出ていると読み取れます。'
  ];

  /* 十二支の主だった五行(蔵干の本気にあたる部分を簡略化した仮の対応) */
  var SHI_GOGYO = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  var GOGYO_NOTE = {
    '木': '伸びていく方向に気が向きやすいと読み取れます。',
    '火': '明るいほうへ気が向かいやすいと読み取れます。',
    '土': '足元を固めるほうに気が向きやすいと読み取れます。',
    '金': '形を整えるほうに気が向きやすいと読み取れます。',
    '水': '流れに合わせて動くほうに気が向きやすいと読み取れます。'
  };

  /* 天中殺は算命学の内部の見方です。独立した占術としては扱いません。 */
  var TENCHUSATSU = ['戌亥', '申酉', '午未', '辰巳', '寅卯', '子丑'];

  var KUBARI = [
    '力を一度にまとめて出すよりも、少しずつ配っていく流れが出ていると読み取れます。',
    '身近な人から順に気を配っていく流れが出ていると読み取れます。',
    '外の広い範囲へ気を向けていく流れが出ていると読み取れます。',
    '自分の内側に気を戻して整える時間が要る流れが出ていると読み取れます。'
  ];
  var MAAI = [
    '相手との間にゆとりを置いたほうが落ち着いて話せると読み取れます。',
    '近い距離で言葉を交わすほうが力が出やすいと読み取れます。',
    '一人で考える時間と人と過ごす時間を分けると整いやすいと読み取れます。'
  ];
  var UGOKIDASHI = [
    '決めてから動き出すまでが早いほうだと読み取れます。',
    '納得できるまで置いてから動き出すほうだと読み取れます。',
    '周りの様子を見てから合わせて動き出すほうだと読み取れます。'
  ];

  function sanmei(b) {
    var idx = mod(b.dayNo - KANSHI_BASE, 60);
    var kanIdx = idx % 10;
    var shiIdx = idx % 12;
    var gogyo = SHI_GOGYO[shiIdx];

    var items = [
        { label: '日の干支', value: KAN[kanIdx] + SHI[shiIdx],
          note: '生まれた日を干支に置きかえた、読み解きの土台にあたる部分です。' },
        { label: '中心の星', value: MAIN_STAR[kanIdx], note: MAIN_STAR_NOTE[kanIdx] },
        { label: '本元の気', value: gogyo, note: GOGYO_NOTE[gogyo] },
        { label: '気の配り方', value: ['広く浅く', '内から外へ', '一点に集めて', '身近な範囲へ'][idx % 4],
          note: KUBARI[idx % 4] },
        { label: '人との間合い', value: ['やや遠め', '近め', '場面で変える'][idx % 3],
          note: MAAI[idx % 3] },
        { label: '動き出しの型', value: ['先に動く', '確かめてから動く', '合わせて動く'][shiIdx % 3],
          note: UGOKIDASHI[shiIdx % 3] },
        { label: '天中殺の組', value: TENCHUSATSU[Math.floor(idx / 10)] + '天中殺',
          note: '算命学の中で「力が抜けやすい時期」として見る区分です。悪いことが起きる印ではなく、' +
                '無理をせず休みを挟む目安として読み取れます。' }
    ];

    return {
      key: 'sanmei',
      name: '算命学',
      view: '生まれ持った気の配り方',
      center: true,
      summary: '土台となる日の干支は「' + KAN[kanIdx] + SHI[shiIdx] + '」、中心の星は「' +
               MAIN_STAR[kanIdx] + '」と出ています。この柱を軸に、暮らしの手触りを' +
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
  var KYUSEI_NOTE = [
    '流れに沿って動くうちに道が見えてくる巡りだと読み取れます。',
    '手間のかかることを引き受けて信頼が積み上がる巡りだと読み取れます。',
    '思いついたことを先に口に出すと進みやすい巡りだと読み取れます。',
    '人と人をつなぐ役目が回ってきやすい巡りだと読み取れます。',
    '中心に置かれて任されることが増えやすい巡りだと読み取れます。',
    '筋を通す姿勢が周りに伝わりやすい巡りだと読み取れます。',
    '場を和ませる言葉が届きやすい巡りだと読み取れます。',
    '積み重ねが変わり目で形になりやすい巡りだと読み取れます。',
    '目立つ場所へ押し出されやすい巡りだと読み取れます。'
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
          note: '生まれた月から見た、ふだんの過ごし方に出やすい面だと読み取れます。' },
        { label: '星の色', value: KYUSEI_IRO[h - 1],
          note: '身の回りに置くと落ち着きやすい色として挙げられているものです。' },
        { label: '定位の方角', value: KYUSEI_HOUI[h - 1],
          note: '九星の盤の上で本命星が本来置かれる場所です。方角の吉凶を断定するものではありません。' }
      ]
    };
  }

  /* ============ 3. 数秘術 ============ */

  var LIFEPATH_NOTE = {
    1: '自分で決めて進む場面が多くなりやすいと読み取れます。',
    2: '相手の様子を受け取って合わせる力が出やすいと読み取れます。',
    3: '思いついたことを形にして楽しむ力が出やすいと読み取れます。',
    4: '手順を整えて積み上げる力が出やすいと読み取れます。',
    5: '場所や環境が変わることで力が出やすいと読み取れます。',
    6: '身近な人の世話を引き受ける場面が増えやすいと読み取れます。',
    7: '一人で調べ、掘り下げる時間が要ると読み取れます。',
    8: '大きな流れをまとめる役目が回ってきやすいと読み取れます。',
    9: '広く行き渡らせることに気が向きやすいと読み取れます。',
    11: '感じ取ったことがそのまま人に伝わりやすいと読み取れます。',
    22: '大きな形にまとめようとする働きが出やすいと読み取れます。',
    33: '損得から離れて人に手を貸す働きが出やすいと読み取れます。'
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
          note: '生まれた日そのものから出る、ふだん表に出やすい面だと読み取れます。' },
        { label: '数の性質', value: master ? 'ゾロ目の数' : (life % 2 === 0 ? '偶数の数' : '奇数の数'),
          note: master ? '同じ数が重なる並びで、力の出方に波が出やすいと読み取れます。'
                       : (life % 2 === 0 ? '周りとつり合いを取る動き方が出やすいと読み取れます。'
                                         : '自分から先に動く動き方が出やすいと読み取れます。') },
        { label: '数の重なり', value: (life === birth ? '重なっている' : '離れている'),
          note: (life === birth
            ? '生き方の数と生まれた日の数が同じで、向きがそろいやすいと読み取れます。'
            : '生き方の数と生まれた日の数が違い、場面によって出る面が変わると読み取れます。') }
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
  var ELEMENT_NOTE = {
    '火': '熱を分けて場をあたためる出方をしやすいと読み取れます。',
    '地': '手で触れられる形にしてから進める出方をしやすいと読み取れます。',
    '風': '言葉にして人と分け合う出方をしやすいと読み取れます。',
    '水': '場の空気を受け取ってから動く出方をしやすいと読み取れます。'
  };
  var MODE = ['活動', '不動', '柔軟'];
  var MODE_NOTE = {
    '活動': '始まりの場面で力が出やすいと読み取れます。',
    '不動': '続けていく場面で力が出やすいと読み取れます。',
    '柔軟': '切り替える場面で力が出やすいと読み取れます。'
  };

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
      summary: '生まれた日、太陽はおおよそ' + name + 'のあたりにあったと見立てます。' + el + 'のグループと' + md +
               'のしるしの重なりから、力の出やすい場面を探っていきます。',
      closing: '空の配置は生まれた瞬間の眺めであって、これからの道筋を定めるものではありません。星空を見上げるつもりで読んでいただけたらと思います。',
      items: [
        { label: '太陽星座', value: name,
          note: '生まれた日に太陽が置かれていた場所として読む部分です。境目の日の生まれの方は、隣の星座として読まれることもあります。' },
        { label: 'エレメント', value: el + 'のグループ', note: ELEMENT_NOTE[el] },
        { label: '三区分', value: md + 'のしるし', note: MODE_NOTE[md] },
        { label: '向かい合う星座', value: SIGN_ORDER[(order + 6) % 12],
          note: '正面に位置する星座で、自分に足りない見方を借りたいときの手がかりになると読み取れます。' }
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
  var SHUKU_KEITOU_NOTE = {
    '和': '相手に合わせて場をなだらかにする調子が出やすいと読み取れます。',
    '栄': '前に出て場を広げる調子が出やすいと読み取れます。',
    '静': '一歩引いて全体を眺める調子が出やすいと読み取れます。'
  };

  function sukuyo(b) {
    var i = mod(b.dayNo - SHUKU_BASE, 27);
    var kei = SHUKU_KEITOU[i % 3];
    return {
      key: 'sukuyo',
      name: '宿曜',
      view: '月の巡りと人との相性',
      summary: '生まれた夜、月は' + SHUKU[i] + 'に宿っていたと見立てます。' + kei +
               'の系統の調子が、人との間にどう流れるかを眺める見方です。',
      closing: '宿は月の通り道を二十七に分けた古い区分です。人と向き合うときの静かな手がかりの一つとして、そばに置いていただけたらと思います。',
      items: [
        { label: '生まれの宿', value: SHUKU[i],
          note: '月が二十七の宿のどこに置かれていたかとして読む部分です。' },
        { label: '宿の系統', value: kei + 'の系統', note: SHUKU_KEITOU_NOTE[kei] },
        { label: '巡りの位置', value: (i + 1) + ' / 27',
          note: '二十七の巡りの中でどのあたりに置かれているかを表しています。' },
        { label: '人との調子', value: ['合わせやすい', '刺激になりやすい', '学び合いやすい'][i % 3],
          note: '相手との間に出やすい調子です。相性の良し悪しを決めるものではないと考えています。' }
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
        { value: '確かめる流れ', phrase: '腑に落ちるまで確かめてから腰を上げる' },
        { value: '合わせる流れ', phrase: '周りの呼吸に合わせて歩幅を決める' }
      ]
    },
    {
      key: 'maai',
      label: '人との間合い',
      cats: [
        { value: '近づく間合い', phrase: '近い距離で言葉を交わしながら深める' },
        { value: '見渡す間合い', phrase: '少し離れた場所から全体を見渡す' },
        { value: '変える間合い', phrase: '相手や場面ごとに距離を描き直す' }
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
         note が言う『力の出方に波が出やすい』に合わせ、波が引くのを待ってから
         腰を上げる=確かめる型(1)に写す(監査E7:根拠の書き直し) */
      { name: '数秘術', ugoki: master ? 1 : (life % 2 === 1 ? 0 : 2), maai: birth % 3 },
      /* 西洋:三区分(活動・不動・柔軟)がそのまま動き出しの3型に対応する */
      { name: '西洋占星術', ugoki: order % 3, maai: ELEMENT_MAAI[order % 4] },
      /* 宿曜:系統(和・栄・静)は個別画面で「人との間にどう流れるか」として説明している
         対人の見方なので、間合い(maai)に写す。和=相手に合わせて距離を描き直す→変える、
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
      agreeBody.push('同じ数だけ別の向きへ寄る組もあるため、はっきりした芯というより、いくつかの寄り合いが並んでいる状態だと読み取れます。');
    }

    var differBody = [];
    var differCat = differAxis.cats[differT.top];
    if (differT.minors.length === 0) {
      differBody.push('今回の入力では、' + differAxis.label + 'についても五つの見方の向きが珍しいほどそろっており、大きな食い違いは見当たりませんでした。');
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
      items: [
        { label: '動き出しの寄り', value: OVERALL_AXES[0].cats[t0.top].value,
          note: '五つの見方のうち' + KANJI_KAZU[t0.count] + 'つがこの向きを指しており、迷ったときの最初の一歩の目安になると読み取れます。' },
        { label: '間合いの寄り', value: OVERALL_AXES[1].cats[t1.top].value,
          note: '人との距離の取り方としては、' + KANJI_KAZU[t1.count] + 'つの見方がこの向きに寄っており、疲れたときに戻る足場になると読み取れます。' }
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
     天中殺などの内部要素はここに含めない。 */
  var ORDER = ['sanmei', 'kyusei', 'suuhi', 'seiyou', 'sukuyo'];

  /**
   * 1占術を仮計算する。
   * @param {string} key 占術キー
   * @param {{birthdate:string}} input
   * @returns {object|null} 計算できないときは null
   */
  function computeOne(key, input) {
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
    computeOne: computeOne,
    computeAll: computeAll,
    computeOverall: computeOverall,
    /* 検証と再利用のために公開する純粋関数 */
    util: { parseDate: parseDate, digitRoot: digitRoot, honmei: honmei, sunSign: sunSign }
  };
});
