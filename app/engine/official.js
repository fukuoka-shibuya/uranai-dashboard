/* 中核5占術の「正式計算」(Issue #35:1サイクル1占術ずつ切り替える)
 *
 * 仮計算(engine/provisional.js)とは別ファイル・別名前空間に分けてあります。
 * 正式な暦・天文計算を入れるのはこのファイルだけで、仮計算側には手を入れません。
 * どの占術を正式計算へ切り替えるかは engine/index.js の OFFICIAL_KEYS 1か所で決めます。
 *
 * 切替済み:算命学(cycle-0036)/九星気学(cycle-0037)/数秘術(cycle-0038)/
 *          西洋占星術(cycle-0039)
 * 未実装 :宿曜/姓名判断(availableKeys に無い占術は
 *          computeOne が null を返し、engine/index.js が自動的に仮計算へ戻します)
 *
 * ==== 算命学の採用方式(計算根拠。サイクル報告書にも明記)====
 *  - 日干支: 万年暦準拠の60日周期。1970年1月1日=辛巳を起点に置く
 *    (2000-01-01=戊午・1990-04-01=丙申 を万年暦と照合済み。tests/official.spec.js)
 *  - 年干支: 立春(太陽黄経315度に達する日)で年が替わる。立春以降の1984年=甲子
 *  - 月干支: 十二節(立春・啓蟄・清明・立夏・芒種・小暑・立秋・白露・寒露・立冬・
 *    大雪・小寒)で月が替わる。月干は五虎遁(年干から寅月の干を起こす標準の方式)
 *  - 節入りの日時は太陽黄経の略算(Meeus の式+ΔT補正)から日本標準時で求める。
 *    このアプリは出生時刻を求めない仕様のため、節入り当日の生まれは新しい月・年として
 *    扱う(日単位の切り替え。時刻による同日内の区別はしない)
 *  - 中心の星(十大主星): 日干と月支の蔵干の陰陽五行の関係(比和=貫索・石門/
 *    洩=鳳閣・調舒/剋す=禄存・司禄/剋される=車騎・牽牛/生じられる=龍高・玉堂)。
 *    蔵干は本気(その支の主たる干)を用いる。初気・中気の日数配分は流派で異なるため、
 *    流派差に依存しない本気方式を採用する
 *  - 天中殺: 日干支の旬から求める(甲子旬=戌亥天中殺 … 甲寅旬=子丑天中殺)
 *
 * ==== 九星気学の採用方式(計算根拠。サイクル報告書にも明記)====
 *  - 本命星: 立春替わりの年を九星に写す標準式(西暦の各桁を一桁になるまで足し、
 *    11 から引く。10になったら9を引く)。年の変わり目は算命学と同じ立春の実日付。
 *    男女とも同じ星で読む方式を採用する(女性を別回りで数える流派もあるが、
 *    日本の九星気学で広く使われる男女同星の方式に合わせる)
 *  - 月命星: 生まれた節月の月盤の中宮星。古来の月紫白の定め
 *    (子午卯酉年=本命星が一白・四緑・七赤の年は寅月が八白/
 *     辰戌丑未年=三碧・六白・九紫の年は寅月が五黄/
 *     寅申巳亥年=二黒・五黄・八白の年は寅月が二黒)から、節月ごとに一つずつ下る。
 *    月の区切りは算命学と同じ十二節の実日付(termDayNo を共用)
 *
 * ==== 数秘術の採用方式(計算根拠。サイクル報告書にも明記)====
 *  - ライフパスナンバー: 生年月日(西暦の年・月・日)の数字をすべて足し、
 *    一桁になるまで足し進める。途中で 11・22・33(ゾロ目=マスターナンバー)が
 *    現れたらそこで止めてそのまま採用する(現代数秘術で広く使われるピタゴラス式)。
 *    年・月・日を別々に一桁へ縮めてから足す流派もあるが、ゾロ目の現れ方が
 *    変わることがあるため、全桁を通して足す方式に統一して開示する
 *  - 誕生数: 生まれた日(1〜31)だけを同じ規則で縮める(11・22 はそのまま)。
 *    生まれた日のみからの縮約であることを結果の文章でも開示する
 *  - 数秘術は暦の計算を使わない(生年月日の数字だけで決まる決定論の計算)
 *
 * ==== 西洋占星術の採用方式(計算根拠。サイクル報告書にも明記)====
 *  - 太陽星座: 太陽の視黄経を実際に計算し、0度(春分点)から30度ごとに区切って
 *    牡羊座〜魚座に当てる。区切りの瞬間は二十四節気の中気(春分=牡羊座・穀雨=牡牛座・
 *    小満=双子座・夏至=蟹座・大暑=獅子座・処暑=乙女座・秋分=天秤座・霜降=蠍座・
 *    小雪=射手座・冬至=山羊座・大寒=水瓶座・雨水=魚座)と同じ瞬間になる
 *  - 出生時刻を求めない仕様のため、生まれた日の正午(日本標準時)の太陽黄経で
 *    その日の星座を決める。日ごとの切り替えではなく正午を代表点に選ぶ理由は二つ:
 *    (1) 時刻の分からない生まれに対して、実際の星座と一致する見込みが最も高い
 *    (星座が替わる瞬間が正午より前なら、その日の大半は新しい星座に入っている)
 *    (2) 黄経の略算には十数分の誤差があるが、正午を境にすると誤差が結果を
 *    変えるのは「替わる瞬間が正午のすぐ近く」の場合だけで、真夜中際の日付ずれで
 *    その日の生まれ全員の星座が入れ替わる事故が起きない
 *  - 星座が替わる日に生まれた方は、生まれた時刻によって隣の星座になり得る。
 *    この点は結果の文章でも開示する
 *  - エレメント(火地風水)・三区分(活動不動柔軟)は星座の並び順から決まる公知の対応
 * いずれも端末内で完結する計算のみで、外部APIは使いません。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiOfficial = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var AVAILABLE_KEYS = ['sanmei', 'kyusei', 'suuhi', 'seiyou'];

  /* ============ 共通の小道具 ============ */

  function mod(n, m) { return ((n % m) + m) % m; }

  /** 1970-01-01 を 0 とした通日(時刻を含めない) */
  function dayNumber(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  /** 'YYYY-MM-DD' を数値に分解する。形式が違う・実在しない日付は null */
  function parseDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) { return null; }
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) { return null; }
    var probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
      return null;
    }
    return { year: y, month: mo, day: d, dayNo: dayNumber(y, mo, d) };
  }

  /* ============ 太陽黄経と節入り(日本標準時) ============ */

  function toRad(deg) { return deg * Math.PI / 180; }
  function norm360(deg) { var d = deg % 360; return d < 0 ? d + 360 : d; }

  /* ΔT(地球の自転の遅れ。暦の時刻系と世界時の差)を10年刻みの実測・推定値から
     線形補間する。節入り時刻を1分未満まで寄せるための補正で、範囲外は端の値を使う */
  /* 節入り時刻の全体精度は略算の限界で±10分程度(監査実測)。真夜中をまたぐ
     境界の日付は上の TERM_DAY_FIX で公知の値に合わせる */
  var DELTA_T = [
    [1890, -6.0], [1900, -2.8], [1910, 10.4], [1920, 21.2], [1930, 24.0],
    [1940, 24.3], [1950, 29.1], [1960, 33.1], [1970, 40.2], [1980, 50.5],
    [1990, 56.9], [2000, 63.8], [2010, 66.1], [2020, 69.4], [2030, 73.0]
  ];
  function deltaTSec(year) {
    if (year <= DELTA_T[0][0]) { return DELTA_T[0][1]; }
    var last = DELTA_T[DELTA_T.length - 1];
    if (year >= last[0]) { return last[1]; }
    for (var i = 1; i < DELTA_T.length; i++) {
      if (year <= DELTA_T[i][0]) {
        var a = DELTA_T[i - 1], b = DELTA_T[i];
        return a[1] + (b[1] - a[1]) * (year - a[0]) / (b[0] - a[0]);
      }
    }
    return last[1];
  }

  /** 世界時のユリウス日(1970-01-01 00:00 UT = 2440587.5) */
  function jdOfUt(y, mo, d, hourUt) {
    return 2440587.5 + Date.UTC(y, mo - 1, d) / 86400000 + hourUt / 24;
  }

  /** 太陽の視黄経(度)。Meeus の略算式(章動・光行差込み。精度は約0.01度) */
  function sunLongitude(jdTt) {
    var T = (jdTt - 2451545.0) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(toRad(M)) +
            (0.019993 - 0.000101 * T) * Math.sin(toRad(2 * M)) +
            0.000289 * Math.sin(toRad(3 * M));
    var omega = 125.04 - 1934.136 * T;
    return norm360(L0 + C - 0.00569 - 0.00478 * Math.sin(toRad(omega)));
  }

  /** 目標黄経との差を -180〜+180 度に畳む(節入り前は負・後は正) */
  function angleDiff(lambda, target) {
    return mod(lambda - target + 180, 360) - 180;
  }

  /* 十二節。idx はその「節月」の番号(0=寅月〜11=丑月)。mo は節入りのある暦月。
     mo=1(小寒)だけは翌年の1月に入ることに注意 */
  var SETSU = [
    { mo: 2, deg: 315 },  /* 立春(年の変わり目でもある) */
    { mo: 3, deg: 345 },  /* 啓蟄 */
    { mo: 4, deg: 15 },   /* 清明 */
    { mo: 5, deg: 45 },   /* 立夏 */
    { mo: 6, deg: 75 },   /* 芒種 */
    { mo: 7, deg: 105 },  /* 小暑 */
    { mo: 8, deg: 135 },  /* 立秋 */
    { mo: 9, deg: 165 },  /* 白露 */
    { mo: 10, deg: 195 }, /* 寒露 */
    { mo: 11, deg: 225 }, /* 立冬 */
    { mo: 12, deg: 255 }, /* 大雪 */
    { mo: 1, deg: 285 }   /* 小寒 */
  ];

  /* 同じ(年, 節)の計算を繰り返さないための控え。入力から一意に決まる値だけを
     入れるため、決定論(同一入力→同一結果)は崩れない */
  var termCache = {};

  /* 節入りが真夜中の直前直後(略算の誤差±10分の内側)にあり、略算では日付が
     1日ずれることを国立天文台の暦要項と照合して確認した節の上書き表。
     値は公表された日本時の節入り日。ずれの疑いが残る他の境界年の照合は
     台帳 OC35a-L2 の継続課題(見つかり次第ここに追記する) */
  var TERM_DAY_FIX = {
    '2023/1/285': dayNumber(2023, 1, 6) /* 小寒 2023-01-06 00:05 JST(略算は前日23:55) */
  };

  /**
   * 暦年 y の暦月 mo にある節入り(黄経 targetDeg)の日本時刻の日付を通日で返す。
   * その月の1日0時〜15日0時(JST)の間で二分法により交差時刻を求める。
   */
  function termDayNo(y, mo, targetDeg) {
    var cacheKey = y + '/' + mo + '/' + targetDeg;
    if (Object.prototype.hasOwnProperty.call(TERM_DAY_FIX, cacheKey)) {
      return TERM_DAY_FIX[cacheKey];
    }
    if (Object.prototype.hasOwnProperty.call(termCache, cacheKey)) {
      return termCache[cacheKey];
    }
    var dt = deltaTSec(y) / 86400;
    /* JST の 0時 = 前日 15時 UT。時刻は UT 基準の JD で持ち、最後に9時間足して日付へ戻す */
    var lo = jdOfUt(y, mo, 1, -9);
    var hi = lo + 14;
    for (var i = 0; i < 50; i++) {
      var mid = (lo + hi) / 2;
      if (angleDiff(sunLongitude(mid + dt), targetDeg) < 0) { lo = mid; } else { hi = mid; }
    }
    /* 交差時刻(UT)に9時間を足し、JST の暦日に直して通日にする */
    var jstMs = ((lo + hi) / 2 - 2440587.5) * 86400000 + 9 * 3600000;
    var result = Math.floor(jstMs / 86400000);
    termCache[cacheKey] = result;
    return result;
  }

  /** 立春(黄経315度)の通日。年干支・月干支・本命星の年の変わり目 */
  function risshunDayNo(y) { return termDayNo(y, 2, 315); }

  /** 立春替わりで数えた年(立春の当日から新しい年。日単位) */
  function solarYearOf(b) {
    return (b.dayNo < risshunDayNo(b.year)) ? b.year - 1 : b.year;
  }

  /**
   * 節月の番号(0=寅月〜11=丑月)。立春替わりの年 sy の中で、
   * 生まれた日を含む節月を実際の節入り日から探す。
   * 小寒(添字11)だけは翌年の1月にあるため年を1つ進めて調べる。
   */
  function setsuIndexOf(b, sy) {
    var idx = 0;
    for (var i = 1; i < 12; i++) {
      var ty = (SETSU[i].mo === 1) ? sy + 1 : sy;
      if (b.dayNo >= termDayNo(ty, SETSU[i].mo, SETSU[i].deg)) { idx = i; } else { break; }
    }
    return idx;
  }

  /* ============ 干支・十大主星・天中殺の表 ============ */

  var KAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  /* 日干支の起点:1970-01-01(通日0)= 辛巳(60干支の18番目・添字17)。
     万年暦との照合は tests/official.spec.js の既知日付検査で行う */
  var DAY_KANSHI_OFFSET = 17;

  /* 十干の五行(0=木 1=火 2=土 3=金 4=水)。陰陽は添字の偶奇(偶数=陽) */
  var KAN_GOGYO = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
  var GOGYO_NAME = ['木', '火', '土', '金', '水'];

  /* 月支の蔵干(本気)。子=癸・丑=己・寅=甲・卯=乙・辰=戊・巳=丙・
     午=丁・未=己・申=庚・酉=辛・戌=戊・亥=壬 */
  var ZOKAN_HONKI = [9, 5, 0, 1, 4, 2, 3, 5, 6, 7, 4, 8];

  var TEN_STAR = ['貫索星', '石門星', '鳳閣星', '調舒星', '禄存星',
                  '司禄星', '車騎星', '牽牛星', '龍高星', '玉堂星'];

  /**
   * 十大主星:日干(dayKan)から見た相手の干(targetKan)との関係で決まる。
   * 比和(同じ五行)=貫索・石門/日干が生じる=鳳閣・調舒/日干が剋す=禄存・司禄/
   * 日干が剋される=車騎・牽牛/日干が生じられる=龍高・玉堂。
   * それぞれ陰陽が同じなら前者、違えば後者。
   */
  function tenStarOf(dayKan, targetKan) {
    var gd = KAN_GOGYO[dayKan], gt = KAN_GOGYO[targetKan];
    var rel;
    if (gd === gt) { rel = 0; }
    else if (mod(gd + 1, 5) === gt) { rel = 1; }  /* 相生:日干が生じる(木→火 …) */
    else if (mod(gd + 2, 5) === gt) { rel = 2; }  /* 相剋:日干が剋す(木→土 …) */
    else if (mod(gd + 3, 5) === gt) { rel = 3; }  /* 相剋:日干が剋される(金→木 …) */
    else { rel = 4; }                             /* 相生:日干が生じられる(水→木 …) */
    var samePolarity = (dayKan % 2) === (targetKan % 2);
    return TEN_STAR[rel * 2 + (samePolarity ? 0 : 1)];
  }

  /* 天中殺:日干支の旬(10日ごとの区切り)ごとに欠ける支の組。
     甲子旬=戌亥・甲戌旬=申酉・甲申旬=午未・甲午旬=辰巳・甲辰旬=寅卯・甲寅旬=子丑 */
  var TENCHUSATSU = ['戌亥', '申酉', '午未', '辰巳', '寅卯', '子丑'];

  /* ============ 算命学の文章(語り口は W8:結びは「〜と見ます。」) ============ */

  var MAIN_STAR_NOTE = [
    '一つの物事を自分の間合いで続ける型です。腰を据えるほど持ち味が出ると見ます。',
    '人の輪の中で調子を合わせて進む型です。仲間と組む場面で力が出ると見ます。',
    '目にしたものを楽しみに変える型です。肩の力を抜くほど働きが出ると見ます。',
    '感じたことを細やかに言葉へ移す型です。静かな場で冴えが出ると見ます。',
    '手元にあるものを人へ分ける型です。手渡す場面で持ち味が生きると見ます。',
    '身近なところを地道に整える型です。積み重ねが利く働きと見ます。',
    'まっすぐ動いて場を進める型です。迷いを置かない動きに強みが出ると見ます。',
    '筋を通して役目を果たす型です。任される場で背筋が伸びると見ます。',
    '知らない場所へ出て学びを持ち帰る型です。遠出が糧になる働きと見ます。',
    '学んだことを積み上げて筋道を立てる型です。調べ物に向く働きと見ます。'
  ];

  var GOGYO_NOTE = {
    '木': '伸びていく方向へ向かう気です。上へ育てる場面に向くと見ます。',
    '火': '明るいほうへ向かう気です。場を照らす役に向くと見ます。',
    '土': '足元を固めるほうへ向かう気です。土台づくりに向くと見ます。',
    '金': '形を整えるほうへ向かう気です。仕上げの場面に向くと見ます。',
    '水': '流れに合わせて動く気です。変化に添う場面に向くと見ます。'
  };

  /* ============ 算命学(正式計算) ============ */

  function sanmeiOfficial(b) {
    /* 年干支:立春で年が替わる。立春の当日は新しい年として扱う(日単位) */
    var solarYear = solarYearOf(b);
    var yearIdx = mod(solarYear - 1984, 60);
    var yearKan = yearIdx % 10;

    /* 節月:立春(寅月)から数えて、生まれた日を含む節月を探す */
    var setsuIdx = setsuIndexOf(b, solarYear);

    /* 月干支:五虎遁。寅月の干は年干から決まる(甲己=丙・乙庚=戊・丙辛=庚・丁壬=壬・戊癸=甲) */
    var monthKan = mod(2 + (yearKan % 5) * 2 + setsuIdx, 10);
    var monthShi = mod(2 + setsuIdx, 12);

    /* 日干支:万年暦準拠の60日周期 */
    var dayIdx = mod(b.dayNo + DAY_KANSHI_OFFSET, 60);
    var dayKan = dayIdx % 10;
    var dayShi = dayIdx % 12;

    var centerStar = tenStarOf(dayKan, ZOKAN_HONKI[monthShi]);
    var gogyo = GOGYO_NAME[KAN_GOGYO[dayKan]];

    var items = [
      { label: '日の干支', value: KAN[dayKan] + SHI[dayShi],
        note: '生まれた日を万年暦のとおり干支に写した柱です。この柱を読み解きの根に置くと見ます。' },
      { label: '中心の星', value: centerStar, note: MAIN_STAR_NOTE[TEN_STAR.indexOf(centerStar)] },
      { label: '年の干支', value: KAN[yearKan] + SHI[yearIdx % 12],
        note: '生まれた年を立春替わりの暦で数えた柱です。周りの人の目に映りやすい面を表すと見ます。' },
      { label: '月の干支', value: KAN[monthKan] + SHI[monthShi],
        note: '生まれた月を節入りで区切った柱です。日々の過ごし方ににじみやすい面を表すと見ます。' },
      { label: '本元の気', value: gogyo, note: GOGYO_NOTE[gogyo] },
      { label: '天中殺の組', value: TENCHUSATSU[Math.floor(dayIdx / 10)] + '天中殺',
        note: '算命学の中で「力が抜けやすい時期」として見る区分です。悪い出来事の印ではなく、無理をせず休みを挟む目安と見ます。' }
    ];

    return {
      key: 'sanmei',
      name: '算命学',
      view: '生まれ持った気の配り方',
      center: true,
      summary: '暦を正式にたどると、生まれた日の柱は「' + KAN[dayKan] + SHI[dayShi] + '」、そこから導いた中心の星は「' +
               centerStar + '」と出ています。年・月・日の三つの柱を組み立てて、暮らしの手触りを' +
               '六つの窓から眺めていきます。',
      closing: 'ここに並べた柱は、昔ながらの暦の数え方で写し取った生まれの形です。' +
               '形は入り口にすぎず、日々をどう歩むかはあなたの手の中にあるものと見ます。',
      items: items,
      provisional: false
    };
  }

  /* ============ 九星気学(正式計算) ============ */

  /* 九星の名前・色・定位は仮計算側と同じ公知の対応表。文言は仮・正式の二重管理に
     なるため、改稿時は provisional.js 側と同時に更新する(台帳 OC35a-L1 と同じ扱い) */
  var KYUSEI_NAME = ['一白水星', '二黒土星', '三碧木星', '四緑木星', '五黄土星',
                     '六白金星', '七赤金星', '八白土星', '九紫火星'];
  var KYUSEI_IRO = ['白', '黒', '碧', '緑', '黄', '白', '赤', '白', '紫'];
  var KYUSEI_HOUI = ['北', '南西', '東', '南東', '中央', '北西', '西', '北東', '南'];
  /* 語り口(W8):九星の note は「この巡りでは、〜とされています。」の型 */
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

  /** 本命星(1〜9)。立春替わりの年の各桁を一桁まで足し、11から引く標準式 */
  function honmeiStarOf(solarYear) {
    var s = mod(11 - solarYear, 9); /* 各桁の和の一桁化は 9 で割った余りと同じ */
    return s === 0 ? 9 : s;
  }

  /**
   * 月命星(1〜9)。生まれた節月の月盤の中宮星。
   * 寅月の星は本命星の組で決まり(一白・四緑・七赤=八白/三碧・六白・九紫=五黄/
   * 二黒・五黄・八白=二黒)、節月ごとに一つずつ下る(月紫白の定め)。
   */
  function getsumeiStarOf(honmei, setsuIdx) {
    var start = (honmei % 3 === 1) ? 8 : (honmei % 3 === 0) ? 5 : 2;
    return mod(start - 1 - setsuIdx, 9) + 1;
  }

  function kyuseiOfficial(b) {
    var solarYear = solarYearOf(b);
    var h = honmeiStarOf(solarYear);
    var g = getsumeiStarOf(h, setsuIndexOf(b, solarYear));

    return {
      key: 'kyusei',
      name: '九星気学',
      view: '年ごとの巡りと居場所',
      summary: '暦を正式にたどると、本命星は「' + KYUSEI_NAME[h - 1] + '」、月命星は「' +
               KYUSEI_NAME[g - 1] + '」と出ています。立春で年を、節入りで月を区切る昔ながらの' +
               '数え方で、いまのあなたの置かれ方を映していきます。',
      closing: '九つの星の巡りは止まらず、季節の節目ごとに次の座へ移っていきます。' +
               'ここで見た巡りも先を決めつけるものではなく、いまを整える目安として軽く携えていただけたらと思います。',
      items: [
        { label: '本命星', value: KYUSEI_NAME[h - 1], note: KYUSEI_NOTE[h - 1] },
        { label: '月命星', value: KYUSEI_NAME[g - 1],
          note: '生まれた月を節入りで区切った巡りから見た星です。ふだんの過ごし方に出やすい面を映すとされています。' },
        { label: '星の色', value: KYUSEI_IRO[h - 1],
          note: '本命星に結び付けられた色です。身の回りに置くと落ち着きやすいとされています。' },
        { label: '定位の方角', value: KYUSEI_HOUI[h - 1],
          note: '九星の盤の上で本命星が本来座る場所です。方角の良し悪しを決めるものではありません。' }
      ],
      provisional: false
    };
  }

  /* ============ 数秘術(正式計算) ============ */

  /* 数の文言は仮計算側と同じ表。仮・正式の二重管理になるため、改稿時は
     provisional.js 側と同時に更新する(台帳 OC35a-L1・OC35b-L3 と同じ扱い)。
     語り口(W8):数秘の note は数そのものを主語に置き「〜ようです。」で結ぶ */
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
    22: '22という数は、大きな形へまとめ上げる働きを帯びるようです。',
    33: '33という数は、損得から離れて人へ手を貸す働きを帯びるようです。'
  };

  /** 一桁になるまで各桁を足す。11・22・33(ゾロ目)が現れたらそこで止める */
  function reduceKeepMaster(n) {
    var v = n;
    while (v > 9 && v !== 11 && v !== 22 && v !== 33) {
      var s = 0, t = v;
      while (t > 0) { s += t % 10; t = Math.floor(t / 10); }
      v = s;
    }
    return v;
  }

  /** ライフパスナンバー:生年月日の全桁の和から縮める(ピタゴラス式) */
  function lifePathOf(b) {
    var digits = String(b.year) + String(b.month) + String(b.day);
    var sum = 0;
    for (var i = 0; i < digits.length; i++) { sum += Number(digits.charAt(i)); }
    return reduceKeepMaster(sum);
  }

  function suuhiOfficial(b) {
    var life = lifePathOf(b);
    var birth = reduceKeepMaster(b.day);
    var master = (life === 11 || life === 22 || life === 33);

    return {
      key: 'suuhi',
      name: '数秘術',
      view: '数に置きかえた性質',
      summary: (master
        ? '生年月日の数字を正式な作法で足し進めると、同じ数が重なる「' + life + '」が現れます。' +
          'この並びは、それ以上足し進めずにそのまま読む作法があります。'
        : '生年月日の数字を正式な作法で足しつづけると「' + life + '」にたどり着きます。') +
        '生まれた日だけを縮めた誕生数「' + birth + '」との取り合わせから、' +
        '日々の選び方に出る癖が浮かび上がると読み取れます。',
      closing: '数はその人のすべてを言い当てる物差しではありません。' +
               '合うと感じたところだけを、そっと持ち帰っていただけたらと思います。',
      items: [
        { label: 'ライフパスナンバー', value: String(life), note: LIFEPATH_NOTE[life] },
        { label: '誕生数', value: String(birth),
          note: '誕生数は生まれた日だけを縮めて出す数です。ふだん表に出やすい面を映すようです。' },
        { label: '数の性質', value: master ? 'ゾロ目の数' : (life % 2 === 0 ? '偶数の数' : '奇数の数'),
          note: master ? '同じ数が重なる並びです。この数は力の出方に波を持たせるようです。'
                       : (life % 2 === 0 ? '偶数という数は、周りとつり合いを取る動き方へ寄せるようです。'
                                         : '奇数という数は、自分から先に動く動き方へ寄せるようです。') },
        { label: '数の重なり', value: (life === birth ? '重なっている' : '離れている'),
          note: (life === birth
            ? '生き方の数と生まれた日の数が同じ組み合わせです。二つの数は向きをそろえやすいようです。'
            : '生き方の数と生まれた日の数が違う組み合わせです。場面によって前へ出る数が替わるようです。') }
      ],
      provisional: false
    };
  }

  /* ============ 西洋占星術(正式計算) ============ */

  /* 星座・エレメント・三区分の対応と文言は仮計算側と同じ表。仮・正式の二重管理に
     なるため、改稿時は provisional.js 側と同時に更新する(台帳 OC35a-L1 と同じ扱い)。
     並びは黄経0度(春分点)からの順で、添字がそのまま 30度刻みの区画になる */
  var SIGN_ORDER = ['牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座',
                    '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座'];
  var ELEMENT = ['火', '地', '風', '水'];
  /* 語り口(W8):西洋の note は空・自然の比喩「〜ように、」から入り「〜でしょう。」で結ぶ */
  var ELEMENT_NOTE = {
    '火': 'たき火が人を寄せるように、熱を分けて場をあたためる出方をしやすいでしょう。',
    '地': '大地に種をおろすように、手で触れられる形にしてから進める出方をしやすいでしょう。',
    '風': '風が知らせを運ぶように、言葉にして人と分け合う出方をしやすいでしょう。',
    '水': '水が器に沿うように、場の空気を受け取ってから動く出方をしやすいでしょう。'
  };
  var MODE = ['活動', '不動', '柔軟'];
  var MODE_NOTE = {
    '活動': '夜明けの空が動き出すように、始まりの場面で力が出やすいでしょう。',
    '不動': '北極星が座を変えないように、続けていく場面で力が出やすいでしょう。',
    '柔軟': '月が満ち欠けで姿を変えるように、切り替えの場面で力が出やすいでしょう。'
  };

  /** 生まれた日の正午(日本標準時=世界時の3時)の太陽の視黄経(度) */
  function sunLongitudeAtNoonJst(b) {
    return sunLongitude(jdOfUt(b.year, b.month, b.day, 3) + deltaTSec(b.year) / 86400);
  }

  /* 星座の替わり目(黄経が30度の倍数になる瞬間=二十四節気の中気)が正午(日本時)の
     ごく近くに来る日は、略算の誤差(数分〜十数分)では正午のどちら側かが決まらない。
     その日付だけを国立天文台暦計算室「二十四節気・雑節 長期版」の公表時刻と照合して
     確定させた上書き表。値は正午の時点での星座の番号(0=牡羊座〜11=魚座)。
     公表値の確認が取れた日付だけを載せる(出典なしで足さない)。
     替わり目が正午の前後20分以内に来る日は1900〜2029年で43日ある。この43日は
     tests/official.spec.js の NOON_EDGE_SIGNS に出典つきで並べてあり、うち18日は
     公表暦(国立天文台・米海軍天文台)と照合済み、残りは別実装の独立計算との一致を
     確認した値である。略算が正午の反対側と出したのは下の2日だけだった */
  var SIGN_DAY_FIX = {
    /* 秋分(黄経180度)は 12:05 JST=正午にはまだ未到達。略算は正午の3.9分前と出す */
    '1981-09-23': 5,  /* 乙女座(略算は天秤座) */
    /* 春分(黄経0度)は 12:02 JST=正午にはまだ未到達。略算は正午の2.6分前と出す */
    '1991-03-21': 11  /* 魚座(略算は牡羊座) */
  };

  function signFixKeyOf(b) {
    return b.year + '-' + (b.month < 10 ? '0' : '') + b.month +
           '-' + (b.day < 10 ? '0' : '') + b.day;
  }

  /** 太陽星座の番号(0=牡羊座〜11=魚座)。黄経を30度ごとに区切る。
      製品の結果文もこの関数を通す(区画式はここ1か所。台帳 OC35d-M2) */
  function sunSignIndexOf(b) {
    var fixKey = signFixKeyOf(b);
    if (Object.prototype.hasOwnProperty.call(SIGN_DAY_FIX, fixKey)) {
      return SIGN_DAY_FIX[fixKey];
    }
    return mod(Math.floor(sunLongitudeAtNoonJst(b) / 30), 12);
  }

  /** 星座の中での度数(0〜29度)。選ばれた星座の起点から数えるため、
      上書き表が効いた日でも星座と度数が食い違わない(台帳 OC35d-M3)。
      上書き表が効いた日は、正午の時点で次の星座の起点をほんのわずか(20分ぶん=
      0.02度未満)越えているため、生の度数はちょうど30度になる。その1度ぶんだけを
      星座の終わり(29度)として表示する。31度以上の食い違い(=上書き表の番号が
      そもそも誤っている場合)は丸めずにそのまま出し、検査で表に出す(台帳 OC40a-M1) */
  function degreeInSignOf(b, order) {
    var deg = Math.floor(mod(sunLongitudeAtNoonJst(b) - order * 30, 360));
    return (deg >= 30 && deg < 31) ? 29 : deg;
  }

  function seiyouOfficial(b) {
    var order = sunSignIndexOf(b);
    var name = SIGN_ORDER[order];
    var el = ELEMENT[order % 4];
    var md = MODE[order % 3];
    var degInSign = degreeInSignOf(b, order);

    return {
      key: 'seiyou',
      name: '西洋占星術',
      view: '空の配置から見た傾向',
      summary: '太陽の位置を正式に計算すると、生まれた日の正午(日本時)の太陽は' + name + 'の' +
               degInSign + '度あたりに位置していました。' + el + 'のグループと' + md +
               'のしるしの重なりから、力の出やすい場面を探っていきます。',
      closing: '空の配置は生まれた日の眺めであって、これからの道筋を定めるものではありません。' +
               '星空を見上げるつもりで読んでいただけたらと思います。',
      items: [
        { label: '太陽星座', value: name,
          note: '空を一周する太陽の道を三十度ずつに分けるように、正午の太陽の位置から求めた星座です。' +
                '星座が替わる日の生まれの方は、生まれた時刻によって隣の星座として読まれることもあるでしょう。' },
        { label: 'エレメント', value: el + 'のグループ', note: ELEMENT_NOTE[el] },
        { label: '三区分', value: md + 'のしるし', note: MODE_NOTE[md] },
        { label: '向かい合う星座', value: SIGN_ORDER[(order + 6) % 12],
          note: '空の上で正面に位置する星座です。自分に足りない見方を借りたいときの手がかりになるでしょう。' }
      ],
      provisional: false
    };
  }

  /* ============ 入口 ============ */

  function supports(key) { return AVAILABLE_KEYS.indexOf(key) >= 0; }

  function computeOne(key, input) {
    if (!supports(key)) { return null; }
    var b = parseDate(input && input.birthdate);
    if (!b) { return null; }
    if (key === 'sanmei') { return sanmeiOfficial(b); }
    if (key === 'kyusei') { return kyuseiOfficial(b); }
    if (key === 'suuhi') { return suuhiOfficial(b); }
    if (key === 'seiyou') { return seiyouOfficial(b); }
    return null;
  }

  /* 全占術がそろうまでは一括計算・総合占いはこのファイルでは受け持たない
     (engine/index.js が占術ごとに切り替え、残りは仮計算が受け持つ) */
  function computeAll(input) { return null; }

  function computeOverall(input) {
    /* 総合占いは中核5占術がすべて正式計算に切り替わってから実装する。
       それまでは仮計算(provisional.js)側が受け持つ。仮計算を呼び出さないこと。 */
    return null;
  }

  return {
    mode: 'official',
    availableKeys: AVAILABLE_KEYS.slice(),
    supports: supports,
    computeOne: computeOne,
    computeAll: computeAll,
    computeOverall: computeOverall,
    /* 検証のために公開する純粋関数(tests/official.spec.js が使う) */
    util: {
      parseDate: parseDate,
      sunLongitude: sunLongitude,
      termDayNo: termDayNo,
      risshunDayNo: risshunDayNo,
      tenStarOf: tenStarOf,
      dayNumber: dayNumber,
      solarYearOf: solarYearOf,
      setsuIndexOf: setsuIndexOf,
      honmeiStarOf: honmeiStarOf,
      getsumeiStarOf: getsumeiStarOf,
      reduceKeepMaster: reduceKeepMaster,
      lifePathOf: lifePathOf,
      sunLongitudeAtNoonJst: sunLongitudeAtNoonJst,
      sunSignIndexOf: sunSignIndexOf,
      /* 正午の前後を走査して替わり目の時刻を求める検査のために公開する(台帳 OC40a-M2) */
      jdOfUt: jdOfUt,
      deltaTSec: deltaTSec,
      signOrder: SIGN_ORDER.slice()
    }
  };
});
