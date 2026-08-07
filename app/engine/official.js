/* 中核5占術の「正式計算」(Issue #35:1サイクル1占術ずつ切り替える)
 *
 * 仮計算(engine/provisional.js)とは別ファイル・別名前空間に分けてあります。
 * 正式な暦・天文計算を入れるのはこのファイルだけで、仮計算側には手を入れません。
 * どの占術を正式計算へ切り替えるかは engine/index.js の OFFICIAL_KEYS 1か所で決めます。
 *
 * 切替済み:算命学(cycle-0036)/九星気学(cycle-0037)/数秘術(cycle-0038)/
 *          西洋占星術(cycle-0039)/宿曜(cycle-0042)
 * 作りかけ:姓名判断(cycle-0067 の工程1で数え方の規則を決め、cycle-0068 の工程2で
 *          このファイルへ「かなの画数表」と数え方 R1・R2・R4 の骨組みだけを置きました。
 *          AVAILABLE_KEYS にはまだ足していないので computeOne は null を返し、
 *          engine/index.js が自動的に仮計算へ戻します=画面はまだ変わりません。
 *          切替は工程6)
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
 *
 * ==== 宿曜の採用方式(計算根拠。サイクル報告書にも明記)====
 *  - 本命宿: 宿曜経に伝わる標準の求め方に従い、(1) 生年月日を旧暦(太陰太陽暦)に直し、
 *    (2) その旧暦月の一日(ついたち)に月が宿る「朔日宿」を表から取り、
 *    (3) そこから「旧暦の日にち − 1」だけ二十七宿を進める。
 *    朔日宿は 正月=室宿・二月=奎宿・三月=胃宿・四月=畢宿・五月=参宿・六月=鬼宿・
 *    七月=張宿・八月=角宿・九月=氐宿・十月=心宿・十一月=斗宿・十二月=虚宿
 *  - 月の実際の黄経を二十七等分して当てる方式(インド系の分割)もあるが、月は一日で
 *    ほぼ一宿ぶん動くため、出生時刻を求めないこのアプリでは結果が定まらない。
 *    日本で広く使われ、生年月日だけで定まる旧暦・朔日宿の方式を採用して開示する
 *  - 旧暦の求め方: 朔(太陽と月の黄経が重なる瞬間)の日本時の暦日をその月の一日とし、
 *    冬至を含む朔月を十一月として番号を数える。中気(太陽黄経が30度の倍数になる瞬間)を
 *    一つも含まない朔月は閏月とし、直前の月と同じ番号を与える(天保暦と同じ定気法)
 *  - 閏月生まれは、同じ番号の月として同じ朔日宿から数える(翌月へ送る流派もあるが、
 *    閏月がその番号の月の一部であるという暦の数え方に合わせる)。結果の文章でも開示する
 *  - 朔の時刻は Meeus『Astronomical Algorithms』第49章「月の位相」の級数で求める
 *    (精度は数秒。公表された朔の時刻と照合済み)。日付は日本標準時で切る
 *  - 宿の系統: 宿曜経の「七科分宿」(安住・和善・急速・軽燥・毒害・猛悪・剛柔)。
 *    経典に伝わる古い呼び名で、人の善し悪しを表すものではない。cycle-0057(Issue #51)から
 *    画面へはこの名を出さず、付き合い方を述べた平易な言い換え(SHUKU_KEITOU_PLAIN)を出す。
 *    分類そのものは変えていないため、どの宿がどの型に属するかは不変
 *
 * ==== 姓名判断の採用方式(工程2の時点。決めごとの原本は docs/seimei-dictionary-plan.md 7節)====
 *  - 数え方の規則 R1〜R10 と、値を決めるときの作業規則 V1〜V3 は同文書の 7-2 節が原本。
 *    このファイルはそのうち R1・R2・R4 だけを実装する(工程2の範囲)
 *  - R1: 数える前に NFKC 正規化をかける。「同じ字の別の書き方」(半角カナ・結合濁点・
 *    互換漢字)を一つにそろえるだけで、旧字体を新字体へ読み替えることはしない(R3)
 *  - R2: 空白は数えない
 *  - R4: かな・長音記号は KANA_STROKES の表の値。濁点は +2 画・半濁点は +1 画
 *  - R5(漢字3000字の表)は工程4、R6・R7(表に無い文字の扱いと画面の案内)は工程5・工程3。
 *    そのため kanaStrokesOf は表に無い文字に対して「値を作らず null を返す」。
 *    仮計算(provisional.js)がここで使っている文字コード由来の換算値
 *    (codePointAt % 27 + 3)は根拠が無いため、正式計算へは持ち込まない(7-3 節の案3を不採用)
 *  - R9: 吉凶・五格(天格・人格・地格・外格・総格)は出さない。この区画にも表を置かない
 * いずれも端末内で完結する計算のみで、外部APIは使いません。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiOfficial = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var AVAILABLE_KEYS = ['sanmei', 'kyusei', 'suuhi', 'seiyou', 'sukuyo'];

  /* 総合占いを組む中核5占術。この5つがすべて AVAILABLE_KEYS にそろってはじめて
     総合占いを正式計算で組める(1つでも欠けたら engine/index.js が仮計算へ戻す) */
  var CORE_KEYS = ['sanmei', 'kyusei', 'suuhi', 'seiyou', 'sukuyo'];

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

  /* ============ 朔(新月)と旧暦(宿曜が使う暦) ============ */

  /**
   * 朔(太陽と月の黄経が重なる瞬間)の力学時のユリウス日。
   * Meeus『Astronomical Algorithms』第49章「月の位相」の級数を用いる。
   * k は 2000年1月の朔を 0 とした通し番号で、整数のとき朔になる。
   */
  function newMoonJde(k) {
    var T = k / 1236.85;
    var T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var jde = 2451550.09766 + 29.530588861 * k
            + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    /* M=太陽の平均近点角 Mp=月の平均近点角 F=月の緯度引数 O=月の昇交点黄経 */
    var M = toRad(2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3);
    var Mp = toRad(201.5643 + 385.81693528 * k + 0.0107582 * T2
                   + 0.00001238 * T3 - 0.000000058 * T4);
    var F = toRad(160.7108 + 390.67050284 * k - 0.0016118 * T2
                  - 0.00000227 * T3 + 0.000000011 * T4);
    var O = toRad(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3);
    var s = Math.sin;
    jde += -0.40720 * s(Mp)
         + 0.17241 * E * s(M)
         + 0.01608 * s(2 * Mp)
         + 0.01039 * s(2 * F)
         + 0.00739 * E * s(Mp - M)
         - 0.00514 * E * s(Mp + M)
         + 0.00208 * E * E * s(2 * M)
         - 0.00111 * s(Mp - 2 * F)
         - 0.00057 * s(Mp + 2 * F)
         + 0.00056 * E * s(2 * Mp + M)
         - 0.00042 * s(3 * Mp)
         + 0.00042 * E * s(M + 2 * F)
         + 0.00038 * E * s(M - 2 * F)
         - 0.00024 * E * s(2 * Mp - M)
         - 0.00017 * s(O)
         - 0.00007 * s(Mp + 2 * M)
         + 0.00004 * s(2 * Mp - 2 * F)
         + 0.00004 * s(3 * M)
         + 0.00003 * s(Mp + M - 2 * F)
         + 0.00003 * s(2 * Mp + 2 * F)
         - 0.00003 * s(Mp + M + 2 * F)
         + 0.00003 * s(Mp - M + 2 * F)
         - 0.00002 * s(Mp - M - 2 * F)
         - 0.00002 * s(3 * Mp + M)
         + 0.00002 * s(4 * Mp);
    /* 惑星による小さな揺らぎの補正(第49章の付加項) */
    var A = [
      [0.000325, 299.77 + 0.107408 * k - 0.009173 * T2],
      [0.000165, 251.88 + 0.016321 * k],
      [0.000164, 251.83 + 26.651886 * k],
      [0.000126, 349.42 + 36.412478 * k],
      [0.000110, 84.66 + 18.206239 * k],
      [0.000062, 141.74 + 53.303771 * k],
      [0.000060, 207.14 + 2.453732 * k],
      [0.000056, 154.84 + 7.306860 * k],
      [0.000047, 34.52 + 27.261239 * k],
      [0.000042, 207.19 + 0.121824 * k],
      [0.000040, 291.34 + 1.844379 * k],
      [0.000037, 161.72 + 24.198154 * k],
      [0.000035, 239.56 + 25.513099 * k],
      [0.000023, 331.55 + 3.592518 * k]
    ];
    for (var i = 0; i < A.length; i++) { jde += A[i][0] * s(toRad(A[i][1])); }
    return jde;
  }

  var newMoonCache = {};

  /** k 番目の朔の瞬間を日本標準時の暦日に直した通日(=旧暦のその月の一日) */
  function newMoonDayNo(k) {
    if (Object.prototype.hasOwnProperty.call(newMoonCache, k)) { return newMoonCache[k]; }
    var jde = newMoonJde(k);
    var yearApprox = 2000 + (jde - 2451545.0) / 365.25;
    var jdUt = jde - deltaTSec(yearApprox) / 86400;
    var result = Math.floor((jdUt - 2440587.5) + 9 / 24);
    newMoonCache[k] = result;
    return result;
  }

  /** 通日 dayNo を含む朔月の番号。朔の当日はその月の一日として数える */
  function newMoonIndexOnOrBefore(dayNo) {
    /* 2000年1月の朔(k=0)は日本時 2000-01-07(通日10963)。周期からおおよその番号を
       出したうえで、前後へ歩いて確定させる(略算の誤差に依存しない) */
    var k = Math.round((dayNo - 10963) / 29.530588861);
    while (newMoonDayNo(k) > dayNo) { k--; }
    while (newMoonDayNo(k + 1) <= dayNo) { k++; }
    return k;
  }

  var solsticeCache = {};

  /** 冬至(太陽黄経270度)の日本時の暦日を通日で返す。旧暦の月の番号の基準になる */
  function winterSolsticeDayNo(y) {
    if (Object.prototype.hasOwnProperty.call(solsticeCache, y)) { return solsticeCache[y]; }
    var dt = deltaTSec(y) / 86400;
    var lo = jdOfUt(y, 12, 15, -9); /* 日本時 12月15日 0時 */
    var hi = lo + 14;               /* 日本時 12月29日 0時 */
    for (var i = 0; i < 50; i++) {
      var mid = (lo + hi) / 2;
      if (angleDiff(sunLongitude(mid + dt), 270) < 0) { lo = mid; } else { hi = mid; }
    }
    var jstMs = ((lo + hi) / 2 - 2440587.5) * 86400000 + 9 * 3600000;
    var result = Math.floor(jstMs / 86400000);
    solsticeCache[y] = result;
    return result;
  }

  /** 通日 dayNo の日本時0時における太陽の視黄経(度) */
  function sunLongitudeAtJstMidnight(dayNo) {
    var jdUt = 2440587.5 + dayNo - 9 / 24;
    return sunLongitude(jdUt + deltaTSec(1970 + dayNo / 365.25) / 86400);
  }

  /** 通日 [from, to) の間に中気(太陽黄経が30度の倍数になる瞬間)がいくつ入るか */
  function chukiCountBetween(from, to) {
    var a = sunLongitudeAtJstMidnight(from);
    var span = norm360(sunLongitudeAtJstMidnight(to) - a);
    return Math.floor((a + span) / 30) - Math.floor(a / 30);
  }

  /**
   * 生年月日を旧暦(太陰太陽暦)に直す。{ month: 1〜12, day: 1〜30, leap: 閏月かどうか }
   * 冬至を含む朔月を十一月とし、中気を一つも含まない朔月を閏月とする定気法。
   */
  function lunarDateOf(b) {
    var k = newMoonIndexOnOrBefore(b.dayNo);
    var day = b.dayNo - newMoonDayNo(k) + 1;

    /* 生まれた朔月より前にある直近の冬至の朔月を「十一月」の基準に置く */
    var wsYear = b.year;
    var anchor = newMoonIndexOnOrBefore(winterSolsticeDayNo(wsYear));
    if (anchor > k) {
      wsYear = b.year - 1;
      anchor = newMoonIndexOnOrBefore(winterSolsticeDayNo(wsYear));
    }
    var next = newMoonIndexOnOrBefore(winterSolsticeDayNo(wsYear + 1));

    /* 冬至の月から次の冬至の月までが13朔月ある年には閏月が一つ入る。
       中気を含まない最初の朔月がその閏月になる */
    var leapIdx = -1;
    if (next - anchor === 13) {
      for (var i = anchor + 1; i < next; i++) {
        if (chukiCountBetween(newMoonDayNo(i), newMoonDayNo(i + 1)) === 0) { leapIdx = i; break; }
      }
    }
    var num = 11, leap = false;
    for (var j = anchor + 1; j <= k; j++) {
      if (j === leapIdx) { leap = true; } else { num = num % 12 + 1; leap = false; }
    }
    return { month: num, day: day, leap: leap };
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

  var GOGYO_NOTE = {
    '木': '伸びていく方向へ向かう気です。上へ育てる場面に向くと見ます。',
    '火': '明るいほうへ向かう気です。場を照らす役に向くと見ます。',
    '土': '足元を固めるほうへ向かう気です。土台づくりに向くと見ます。',
    '金': '形を整えるほうへ向かう気です。仕上げの場面に向くと見ます。',
    '水': '流れに合わせて動く気です。変化に添う場面に向くと見ます。'
  };

  /* ============ 算命学(正式計算) ============ */

  /* 生まれた日の二文字の欄に置く書き分けの文(cycle-0062・台帳 OC58-2 の #4)。
     provisional.js の同名の定数と一字一句同じにすること(OC62-5 が突き合わせる)。
     語り口(W8):算命学の note は「〜と見ます。」で結ぶので、名指しを先に置いて
     結びを後ろへ回す。行き先は画面では下に並ぶので「下の」で名指しする。

     二つの行き先で言い方を変えているのは、実装での決まり方が違うため
     (cycle-0062 の監査 R1。はじめ両方まとめて「この二文字が導く」と書いていたが、
     正式計算ではそれが成り立たない)。
       ・本元の気 = KAN_GOGYO[dayKan] なので、日の干支が決まれば一意に決まる
         (仮計算は SHI_GOGYO[shiIdx] で二文字目から取るが、やはり一意)。
         → 「この二文字だけで決まり」と書ける。
       ・中心の星 = tenStarOf(dayKan, ZOKAN_HONKI[monthShi]) で、生まれた月も効く。
         同じ二文字でも月が違えば十の星すべてに散る(1950〜2020年の各月15日で実測)。
         → 「手がかりの一つにして決まり」までしか書けない。
     この二つの言い分けが実装と合っていることは OC62-8 が計算の側から確かめる */
  var DAY_KANSHI_NOTE =
    'ここに出た二文字は、下の二つの読み解きのもとになります。' +
    /* cycle-0065(台帳 OC62-L2):以前は「持って生まれた気の向きはこの二文字だけで決まり、
       下の『持って生まれた気の向き』に…」と、名指しの前に同じ見出しの言葉を先に使っていた。
       前提知識のない読み手には冗長なので、前半を普通の言い方へ置き換えた。
       「この二文字だけで決まり」という言い分そのものは変えていない(OC62-8 が計算の側から見る) */
    '生まれつきの気がどちらへ向きやすいかはこの二文字だけで決まり、下の「持って生まれた気の向き」に書いてあります。' +
    'いちばん出しやすい動き方も、この二文字を手がかりの一つにして決まり、下の「その人の芯にある動き方」に書いてあります。' +
    '二文字そのものに意味を読み取るのではなく、そこから広げていくための出発点と見ます。';

  /* 生まれた月の二文字の欄に置く書き分けの文(cycle-0063・台帳 OC58-2 の #5)。
     この欄も「足す」道は取れない=値は KAN[monthKan] + SHI[monthShi] を並べただけで、
     二文字ごとの意味は計算から何も出ず、原典も手元に無い(#45)。
     一方で行き先は実在する:月支の蔵干が中心の星の判定に使われる
     (centerStarIdx = tenStarOf(dayKan, ZOKAN_HONKI[monthShi]))ので、
     10通りに分かれる読み解きを持つ「中心の星」へ送れる。

     文に書いた「決まり方」は 1930〜2020年の各月15日(1092日)の走査で裏を取った
     (cycle-0062 の監査 R1。書いた因果は必ず計算の側から確かめる)。
       ・この二文字だけでは中心の星は決まらない … 60通りの月の干支すべてで揺れた
       ・後ろの一字は効いている … 日の干支をそろえて月を変えると 60/60 で星が分かれる
       ・前の一字はどの読み解きにも効かない … monthKan はこの欄の値を組み立てる以外に
         使われず、(日の干支・月の後ろ一字)が同じで前の一字だけ違う組が240あるのに
         中心の星は1通りしか出ない(720組すべてで揺れ0)
     この3点は OC63-8 が結果に出ている値だけを使って毎回確かめる(件数720・240も
     そこで表明する)。3点目は「どの読み解きにも」という全称の言い方なので、
     結果値の突き合わせだけでは足りない=OC63-9 が official.js のソースを走査して
     monthKan の出どころが値の組み立てだけであることも見る(cycle-0063 の監査 R6・R7)。

     語り口(W8):算命学の note は「〜と見ます。」で結ぶ。行き先は画面では上に
     並ぶ(日の干支・中心の星・年の干支・月の干支…の順)ので「上の」で名指しする。
     provisional.js の算命学にはこの項目そのものが無いため、DAY_KANSHI_NOTE と違い
     この文は official.js の1か所だけにある(OC63-5 がそのことを表明する) */
  var MONTH_KANSHI_NOTE =
    'ここに出た二文字のうち、後ろの一字は、いちばん出しやすい動き方を決めるときの手がかりの一つになっています。' +
    'その読み解きは、上の「その人の芯にある動き方」に書いてあります。' +
    '前の一字はどの読み解きにも使っておらず、この二文字そのものに別々の意味を当ててもいません。' +
    '二文字そのものを読むところではなく、上の一文へつなぐところと見ます。';

  /* ============ 算命学:二文字ごとの読み(オーナーコメント #55・工程1の器) ============

     オーナーコメント #55(2026-08-07)のご指示:
       「日の干支・年の干支・月の干支の3欄すべてに、その干支自体の読みを用意する。
         60通り×3欄=180本。読みを載せられない欄は表示しない。表示する欄には
         必ず読みを載せる。仕組みの断り書き(何通りある・この欄では読み解いていない・
         この一字は使っていない)は全廃する。3欄はそれぞれ役割が違うので書く角度を
         変えること。180本を機械的に量産すると同じ言い回しの繰り返しになるので、
         反復率を検査項目に入れ、報告書に出すこと。進捗(何本済み/180)も出すこと。」

     工程表・読みの導き方・反復率の決めごとは docs/sanmei-kanshi-plan.md にある。
     この区画は工程1で置いた「器」で、まだ1本も入っていない。computeOne はこの
     区画のどこも呼んでいないので、画面も結果値もこの区画によっては変わらない
     (tests/sanmei.spec.js の SANMEI1-4 が毎サイクル表明する)。切替は工程5で、
     そのとき上の DAY_KANSHI_NOTE / 年の干支の文 / MONTH_KANSHI_NOTE を落として
     items の note をこの表から引く形へ変える。 */

  /* 60通りの二文字。添字 0〜59 は六十干支の並びそのもので、実装の各所
     (dayIdx・yearIdx)と同じ数え方をする=表の鍵を別に手で並べない */
  var KANSHI_KEYS = (function () {
    var list = [];
    for (var i = 0; i < 60; i++) { list.push(KAN[i % 10] + SHI[i % 12]); }
    return list;
  })();

  /* 読みを置く3欄。#55 のご指示どおり欄ごとに書く角度が違う
       day   = 生まれ持った芯 / year = 周りから見えやすい面 / month = ふだんの暮らしぶり */
  var KANSHI_FIELDS = ['day', 'year', 'month'];

  /* 二文字ごとの読みの表。工程2〜4でここへ 60×3=180 本を入れていく。
     いまは空で、進捗は「この表を数える」形でしか報告書に出さない(#45) */
  var KANSHI_YOMI = { day: {}, year: {}, month: {} };

  /* 反復率の決めごと(docs/sanmei-kanshi-plan.md の5節)。閾値をここ1か所に置き、
     検査も報告書も同じ値を引く=文書と検査で別々の数を持たない */
  var KANSHI_GRAM = 4;          /* 「同じ言い回し」とみなす文字の連なりの長さ */
  var KANSHI_RUN_LIMIT = 20;    /* これ以上そのまま同じなら丸ごとの使い回しとみなす */
  var KANSHI_LIMITS = { average: 0.40, max: 0.70 };

  /* 表を引く。無い二文字・無い欄には値を作らず null を返す(姓名判断の kanaStrokesOf と
     同じ安全側)。空文字を返してはいけない=「読みが無い」のか「空の読みがある」のかを
     呼ぶ側が見分けられなくなり、#55 の「読みを載せられない欄は表示しない」が実装できない */
  function kanshiYomiOf(field, kanshi) {
    if (!Object.prototype.hasOwnProperty.call(KANSHI_YOMI, field)) { return null; }
    var table = KANSHI_YOMI[field];
    if (!table || !Object.prototype.hasOwnProperty.call(table, kanshi)) { return null; }
    var text = table[kanshi];
    return (typeof text === 'string' && text.length > 0) ? text : null;
  }

  /* 二文字ごとの読みを書くときの手がかり(docs/sanmei-kanshi-plan.md の4節)。
     原典が手元に無いので、実装がすでに持っている根拠だけから組み立てる。
     idx は六十干支の添字(0〜59)。返す5つは
       kan_ki   前の一字の気   KAN_GOGYO(0=木 1=火 2=土 3=金 4=水)
       kan_yang 前の一字の陰陽 添字の偶奇(1=陽 0=陰)
       shi_ki   後ろの一字の気 蔵干の本気を KAN_GOGYO に通したもの
       season   後ろの一字の季節 0=春 1=夏 2=秋 3=冬(寅から数える=実装の
                monthShi = mod(2 + setsuIdx, 12) と同じ数え方)
       place    季節の中の位置 0=初め 1=中 2=終わり
     この5つの組が60通りと1対1であることは SANMEI1-1 が数えて確かめる */
  function kanshiTraitsOf(idx) {
    var k = mod(idx, 10), s = mod(idx, 12);
    var fromTora = mod(s - 2, 12);
    return {
      kan_ki: KAN_GOGYO[k],
      kan_yang: (k % 2 === 0) ? 1 : 0,
      shi_ki: KAN_GOGYO[ZOKAN_HONKI[s]],
      season: Math.floor(fromTora / 3),
      place: fromTora % 3
    };
  }

  /* 進捗。報告書の「何本済み/180」はこの数え方だけを出どころにする */
  function kanshiYomiProgress() {
    var byField = {}, done = 0, f, i;
    for (f = 0; f < KANSHI_FIELDS.length; f++) {
      var n = 0;
      for (i = 0; i < KANSHI_KEYS.length; i++) {
        if (kanshiYomiOf(KANSHI_FIELDS[f], KANSHI_KEYS[i]) !== null) { n++; }
      }
      byField[KANSHI_FIELDS[f]] = n;
      done += n;
    }
    return { done: done, total: KANSHI_FIELDS.length * KANSHI_KEYS.length, by_field: byField };
  }

  function kanshiGramsOf(text, n) {
    var set = {}, i;
    for (i = 0; i + n <= text.length; i++) { set[text.slice(i, i + n)] = true; }
    return set;
  }

  /* 反復率。書けた読みだけを母集団にし、欄をまたいで1つに混ぜて測る
     (同じ二文字の3欄が互いに似てくる形も捕まえたいため)。
     1本の反復率 = その本に出る4文字の連なりのうち「他の本にも出るもの」の割合。
     全体の反復率はその平均。1本も無いうちは測れないので measured:false を返す
     (0% と書くと「重複なし」に読めてしまう) */
  function kanshiRepetitionOf(texts) {
    var k, key;
    var count = texts.length;
    if (count === 0) {
      return { measured: false, count: 0, average: null, max: null, worst: '',
               duplicates: [], long_runs: [], long_run_count: 0, limits: KANSHI_LIMITS };
    }

    /* どの4連が何本に出るかを先に数える */
    var seen = {};
    for (k = 0; k < count; k++) {
      var g = kanshiGramsOf(texts[k].text, KANSHI_GRAM);
      for (key in g) {
        if (Object.prototype.hasOwnProperty.call(g, key)) { seen[key] = (seen[key] || 0) + 1; }
      }
    }
    var sum = 0, max = 0, worst = '';
    for (k = 0; k < count; k++) {
      var grams = kanshiGramsOf(texts[k].text, KANSHI_GRAM), total = 0, shared = 0;
      for (key in grams) {
        if (!Object.prototype.hasOwnProperty.call(grams, key)) { continue; }
        total++;
        if (seen[key] > 1) { shared++; }
      }
      var ratio = (total === 0) ? 0 : shared / total;
      sum += ratio;
      if (ratio > max) { max = ratio; worst = texts[k].at; }
    }

    /* 完全一致(同じ文が2本以上ある) */
    var byText = {}, duplicates = [];
    for (k = 0; k < count; k++) {
      if (Object.prototype.hasOwnProperty.call(byText, texts[k].text)) {
        duplicates.push(byText[texts[k].text] + ' と ' + texts[k].at);
      } else { byText[texts[k].text] = texts[k].at; }
    }

    /* 丸ごとの使い回し(KANSHI_RUN_LIMIT 文字以上がそのまま同じ)。
       総当たりで最長共通部分を求める代わりに、その長さの窓が2本以上に出るかを見る
       (同じことを判定でき、本数が増えても重くならない)。
       ただし**窓の数をそのまま件数にしない**:26文字が重なっていると20文字の窓は
       7つ取れるので、1か所の使い回しが7件に化けて報告書の数が意味と食い違う
       (cycle-0069 の監査 M5)。窓が連続している区間を1か所へ畳んでから数える。 */
    var runs = {}, longRuns = [], longRunCount = 0;
    for (k = 0; k < count; k++) {
      var g2 = kanshiGramsOf(texts[k].text, KANSHI_RUN_LIMIT);
      for (key in g2) {
        if (Object.prototype.hasOwnProperty.call(g2, key)) { runs[key] = (runs[key] || 0) + 1; }
      }
    }
    for (k = 0; k < count; k++) {
      var body = texts[k].text, prevShared = false;
      for (var p = 0; p + KANSHI_RUN_LIMIT <= body.length; p++) {
        var win = body.slice(p, p + KANSHI_RUN_LIMIT);
        var shared = runs[win] > 1;
        /* 区間の始まりだけを1件として数える(続きは同じ1か所) */
        if (shared && !prevShared) {
          longRunCount++;
          /* 見本は先頭5件だけ載せる。全部は載せないので件数を別に返す(黙って切り詰めない) */
          if (longRuns.length < 5) { longRuns.push(texts[k].at + ':' + win); }
        }
        prevShared = shared;
      }
    }

    return { measured: true, count: count, average: sum / count, max: max, worst: worst,
             duplicates: duplicates, long_runs: longRuns, long_run_count: longRunCount,
             limits: KANSHI_LIMITS };
  }

  /* 表に入っている読みを集めて上の測り方へ渡す。検査は見本を kanshiRepetitionOf へ
     直接渡して同じ関数を通す=測り方を検査側に書き写さない */
  function kanshiRepetition() {
    var texts = [], f, i;
    for (f = 0; f < KANSHI_FIELDS.length; f++) {
      for (i = 0; i < KANSHI_KEYS.length; i++) {
        var t = kanshiYomiOf(KANSHI_FIELDS[f], KANSHI_KEYS[i]);
        if (t !== null) { texts.push({ at: KANSHI_FIELDS[f] + '/' + KANSHI_KEYS[i], text: t }); }
      }
    }
    return kanshiRepetitionOf(texts);
  }

  /**
   * 算命学の三つの柱と、そこから導く中心の星・本元の気。
   * 結果画面(sanmeiOfficial)と総合占い(overallStancesOf)が同じ式を通るように、
   * 計算はこの一か所に置く(同じ式を二重に書かない。台帳 OC42-M3 と同じ方針)。
   */
  function sanmeiCoreOf(b) {
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

    return {
      yearIdx: yearIdx, yearKan: yearKan,
      monthKan: monthKan, monthShi: monthShi,
      dayIdx: dayIdx, dayKan: dayKan, dayShi: dayIdx % 12,
      /* 中心の星は TEN_STAR の添字で返す(名前は表を引いて得る) */
      centerStarIdx: TEN_STAR.indexOf(tenStarOf(dayKan, ZOKAN_HONKI[monthShi])),
      /* 本元の気は日干の五行の添字(0=木 1=火 2=土 3=金 4=水) */
      gogyoIdx: KAN_GOGYO[dayKan]
    };
  }

  function sanmeiOfficial(b) {
    var core = sanmeiCoreOf(b);
    var yearIdx = core.yearIdx, yearKan = core.yearKan;
    var monthKan = core.monthKan, monthShi = core.monthShi;
    var dayIdx = core.dayIdx, dayKan = core.dayKan, dayShi = core.dayShi;

    var centerStar = TEN_STAR[core.centerStarIdx];
    var gogyo = GOGYO_NAME[core.gogyoIdx];

    var items = [
      /* 語り口(W8):算命学の note は「〜と見ます。」で結ぶ。Issue #51(2026-08-06 オーナー指示)で
         「まず○○の柱です」のような欄そのものの言い直しをやめ、その値が読み手にとって
         何を意味するかを述べる形へ書き替えた(「柱」「区分」の語も画面から外した)。
         欄そのものが何を指すかは engine/index.js の ABOUT が受け持つ(cycle-0053 で分離済み) */
      /* cycle-0062(台帳 OC58-2 の #4):書き分け。60通りの二文字それぞれの意味の
         原典が手元に無いので値ごとの読み解きは書かず、この二文字から導かれる二欄を
         画面の見出しの言葉で名指しする。文は provisional.js と同じにすること
         (片方だけ古くなる事故=台帳 OC48-L1。OC62-5 が両実装の一致を見る)。
         二つの行き先で言い方を変えている理由は DAY_KANSHI_NOTE の注記を参照 */
      { label: '日の干支', value: KAN[dayKan] + SHI[dayShi], note: DAY_KANSHI_NOTE },
      { label: '中心の星', value: centerStar, note: MAIN_STAR_NOTE[TEN_STAR.indexOf(centerStar)] },
      { label: '年の干支', value: KAN[yearKan] + SHI[yearIdx % 12],
        note: '生まれた年から出るこの二文字は、周りの人の目に映りやすいあなたの面を表します。人からどう見られやすいかを知る手がかりになると見ます。' },
      /* cycle-0063(台帳 OC58-2 の #5):書き分け。理由と裏づけは MONTH_KANSHI_NOTE の注記 */
      { label: '月の干支', value: KAN[monthKan] + SHI[monthShi], note: MONTH_KANSHI_NOTE },
      { label: '本元の気', value: gogyo, note: GOGYO_NOTE[gogyo] },
      { label: '天中殺の組', value: TENCHUSATSU[Math.floor(dayIdx / 10)] + '天中殺',
        note: 'あなたにとって力が抜けやすい時期を、算命学ではこの呼び名で表します。悪い出来事の印ではなく、無理をせず休みを挟む目安と見ます。' }
    ];

    return {
      key: 'sanmei',
      name: '算命学',
      view: '生まれ持った気の配り方',
      center: true,
      summary: '暦を正式にたどると、生まれた日を表す二文字は「' + KAN[dayKan] + SHI[dayShi] + '」、そこから導いた中心の星は「' +
               /* cycle-0065(台帳 OC63-L3):以前は「年・月・日それぞれの二文字を組み合わせて」と
                  書いていたが、cycle-0063 の実測で、年の二文字はどの読み解きにも効かず、
                  月は後ろの一字だけが効くことが確かめられている。導入文を実態へそろえた */
               centerStar + '」と出ています。生まれた日の二文字を軸に、生まれた月の二文字も併せて、' +
               '暮らしの手触りを六つの窓から眺めていきます。',
      closing: 'ここに並べた二文字は、昔ながらの暦の数え方で写し取った生まれの形です。' +
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
  /* 語り口(W8):九星の note は「〜とされています。」で結ぶ型。本命星は
     「この巡りでは、」、月命星は「この星は、」、星の色などの注記はそれ以外で始まる */
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

  /* 月命星の項目に添える「人との近さの取り方」の一文(添字は星の番号−1)。
     cycle-0048 で追加した(台帳 OC43-L2 の残り)。それまで月命星の note は
     9星とも同じ一文で、値ごとの説明が画面に無かったため、総合占いの
     「人との間合い」は本命星の項目にしか出ない KYUSEI_NOTE を読み替えて
     写していた。ここに星ごとの一文を置き、KYUSEI_MAAI はこの文から写す。
     語り口(W8):九星の note は「〜とされています。」で結ぶ */
  var KYUSEI_GETSUMEI_MAAI_NOTE = [
    'この星は、人との近さを相手や場の流れに合わせて移し変えていくとされています。',
    'この星は、手のかかる役をそばで引き受けながら人との距離を縮めていくとされています。',
    'この星は、自分から先に声をかけて人の懐へ入っていくとされています。',
    'この星は、間に入る相手の組み合わせが替わるたびに、自分と双方との近さを取り直すとされています。',
    'この星は、輪の中心に置かれ、一人ひとりへ寄る前に場の全体を眺めるとされています。',
    'この星は、筋を保ったまま、踏み込みすぎない間を空けて人と向き合うとされています。',
    'この星は、和ませる言葉を交わしながら人と親しくなっていくとされています。',
    'この星は、積み重ねてきた間柄ほど深入りせず、一歩引いた位置から人を見るとされています。',
    'この星は、光の当たる場所へ出るたびに、人との近さがひとりでに移り変わるとされています。'
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

  /** 本命星と月命星(ともに1〜9)。結果画面と総合占いが同じ式を通る */
  function kyuseiStarsOf(b) {
    var solarYear = solarYearOf(b);
    var h = honmeiStarOf(solarYear);
    return { honmei: h, getsumei: getsumeiStarOf(h, setsuIndexOf(b, solarYear)) };
  }

  function kyuseiOfficial(b) {
    var stars = kyuseiStarsOf(b);
    var h = stars.honmei;
    var g = stars.getsumei;

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
          note: '生まれた月を節入りで区切った巡りから見た星です。ふだんの過ごし方に出やすい面を映すとされています。' +
                KYUSEI_GETSUMEI_MAAI_NOTE[g - 1] },
        /* cycle-0061(台帳 OC58-2 の #6・#7):この二欄は値が分かれるのに文が1通り
           しか無かった。色・方角そのものの意味の原典が手元に無いため書き起こさず、
           読み解きの行き先を画面の見出しの言葉で名指しする書き分けにした
           (cycle-0059 の宿曜と同じ形)。名指し先は上に並ぶ「生まれた年から見た
           自分の星」で、そこは KYUSEI_NOTE が9通りに分かれている。
           文は provisional.js 側と同じにすること(片方だけ古くなる事故を防ぐ)。
           語り口(W8)は「〜ではありません。」で結ぶ */
        /* 1文目=なぜその欄へ送るのか(値がその星から一意に決まるという関係)。
           2文目=行き先の名指し。3文目=この欄そのものを読み解かないという断り。
           2文目の主語は色・方角そのものにしない。「この方角から何が読み取れるか」
           と書くと、行き先の KYUSEI_NOTE は方角に触れていないため果たせない
           約束になる(cycle-0061 の監査 R4)。「あなたの場合にどう出やすいかは」も
           直前の文の主語が「この色」なので同じ誤読を招く(同 R8)。読み手自身を
           主語にした「あなたの読み解きは」「読むところは」で書く。
           ただし2欄の2文目を同じ文にしてはいけない。同じ結果の中で同じ文が
           繰り返されないことを wording.spec の C4 が見ており、はじめ一字一句
           そろえたところ実際に落ちた(cycle-0061 の実測)。OC61-3 が2欄の
           note どうしにも長い共通部分が無いことを見ている */
        { label: '星の色', value: KYUSEI_IRO[h - 1],
          note: 'この色は生まれた年から見た自分の星が決まればひとりでに決まります。あなたの読み解きは、上の「生まれた年から見た自分の星」に書いてあります。色そのものが人の性質を言い表しているわけではありません。' },
        { label: '定位の方角', value: KYUSEI_HOUI[h - 1],
          note: 'この方角も生まれた年から見た自分の星と一対一で決まります。読むところは色の欄と同じで、上の「生まれた年から見た自分の星」に書いてあります。方角そのものに良し悪しがあるわけではありません。' }
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
    22: '22という数は、大きな形へまとめ上げる働きにつながるようです。',
    33: '33という数は、損得から離れて人へ手を貸す働きにつながるようです。'
  };

  /* 誕生数の項目に添える「人との近さの取り方」の一文。cycle-0048 で追加した
     (台帳 OC43-L2 の残り)。それまで誕生数の note は値によらず同じ一文で、
     総合占いの「人との間合い」はライフパスナンバーの項目にしか出ない
     LIFEPATH_NOTE を誕生数へ当てはめて写していた。ここに数ごとの一文を置き、
     SUUHI_BIRTH_MAAI はこの文から写す。誕生数は生まれた日(1〜31)を縮めた数
     なので、現れるのは 1〜9・11・22 のいずれか(33 は日からは現れない)。
     語り口(W8):数秘の note は数そのものを主語に置き「〜ようです。」で結ぶ。
     「数が人を〜させる」の使役形は、決めつけの語感が出るため使わない
     (cycle-0048 の監査 中5)。既存 LIFEPATH_NOTE と同じ非使役の言い回しへそろえる */
  var SUUHI_BIRTH_MAAI_NOTE = {
    1: '1という数は、人の輪の先頭に立ち、後ろに続く全体が見える距離を保つようです。',
    2: '2という数は、相手のすぐそばで受け答えする近さを好むようです。',
    3: '3という数は、人の輪へ自分から入り込んでいく近さを生むようです。',
    4: '4という数は、一定の距離を置いたまま人と向き合うようです。',
    5: '5という数は、場が替わるたびに人との近さを取り替えるようです。',
    6: '6という数は、身近な人の手元まで寄って世話を焼くようです。',
    7: '7という数は、一人になれる距離を残したまま人と関わるようです。',
    8: '8という数は、輪の外側から流れをつかむ位置に立つようです。',
    9: '9という数は、相手が替わるたびに近さの取り方も入れ替わるようです。',
    11: '11という数は、受け取った気配のぶんだけ相手との間が縮むようです。',
    22: '22という数は、遠くまで見通せる場所から人と組み立てるようです。'
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
          note: '誕生数は生まれた日だけを縮めて出す数です。ふだん表に出やすい面を映すようです。' +
                SUUHI_BIRTH_MAAI_NOTE[birth] },
        { label: '数の性質', value: master ? 'ゾロ目の数' : (life % 2 === 0 ? '偶数の数' : '奇数の数'),
          note: master ? '同じ数が重なる並びです。この数は力の出し方に波が出るようです。'
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
    '火': 'たき火が人を寄せるように、熱を分けて場をあたためるやり方をしやすいでしょう。',
    '地': '大地に種をおろすように、手で触れられる形にしてから進めるやり方をしやすいでしょう。',
    '風': '風が知らせを運ぶように、言葉にして人と分け合うやり方をしやすいでしょう。',
    '水': '水が器に沿うように、場の空気を受け取ってから動くやり方をしやすいでしょう。'
  };
  var MODE = ['活動', '不動', '柔軟'];
  var MODE_NOTE = {
    '活動': '夜明けの空が動き出すように、始まりの場面で力が出やすいでしょう。',
    '不動': '北極星が同じところに見えつづけるように、続けていく場面で力が出やすいでしょう。',
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
               degInSign + '度あたりに位置していました。' + el + 'の性質と' + md +
               'の型の重なりから、力の出やすい場面を探っていきます。',
      closing: '空の配置は生まれた日の眺めであって、これからの道筋を定めるものではありません。' +
               '星空を見上げるつもりで読んでいただけたらと思います。',
      items: [
        { label: '太陽星座', value: name,
          /* cycle-0065(台帳 OC58-L1):以前はここに求め方の説明を置いていたが、
             同じ画面の about が「生まれた日に太陽が空のどのあたりにいたか」と同じことを
             述べており、一画面で二度出ていた。求め方は about が持ち、note は
             値ごとの読み解き(VALUE_NOTE が先頭へ添える)と境目の日の断りだけを持つ */
          note: '星座が替わる日の生まれの方は、生まれた時刻によって隣の星座として読まれることもあるでしょう。' },
        /* Issue #51:値の語尾を平易にした(「のグループ」→「の性質」/「のしるし」→「の型」)。
           火・地・風・水と活動・不動・柔軟の語そのものと添字の対応は変えていない */
        { label: 'エレメント', value: el + 'の性質', note: ELEMENT_NOTE[el] },
        { label: '三区分', value: md + 'の型', note: MODE_NOTE[md] },
        /* cycle-0065(台帳 OC60-L1):以前の note は「空の上で正面に位置する星座です。
           自分に足りない見方を借りたいときの手がかりになるでしょう。」だった。
           前半は about(空を輪にして並べたときの反対側)と同じ内容で、後半は
           VALUE_NOTE が星座ごとに具体的な助言を書いたあとに一般論へ戻る逆順になっていた。
           求め方は about が、読み解きは VALUE_NOTE が持つので、ここは空にする */
        { label: '向かい合う星座', value: SIGN_ORDER[(order + 6) % 12], note: '' }
      ],
      provisional: false
    };
  }

  /* ============ 宿曜(正式計算) ============ */

  /* 二十七宿の並び(昴宿起点)。二十八宿から牛宿を除いた宿曜経の配列。
     仮計算側と同じ表で、改稿時は provisional.js と同時に更新する(台帳 OC35a-L1 と同じ扱い) */
  var SHUKU = ['昴宿', '畢宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '張宿',
               '翼宿', '軫宿', '角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿',
               '斗宿', '女宿', '虚宿', '危宿', '室宿', '壁宿', '奎宿', '婁宿', '胃宿'];

  /* 朔日宿:旧暦の各月の一日に月が宿るとされる宿(宿曜経の伝統的な表)。
     添字0が正月。値は SHUKU の添字で、正月=室宿・二月=奎宿・三月=胃宿・四月=畢宿・
     五月=参宿・六月=鬼宿・七月=張宿・八月=角宿・九月=氐宿・十月=心宿・
     十一月=斗宿・十二月=虚宿 */
  var SAKUJITSU_SHUKU = [22, 24, 26, 1, 3, 5, 8, 11, 13, 15, 18, 20];

  /* 七科分宿(宿曜経に伝わる宿の系統)。経典の古い呼び名であり、人の善し悪しの評価では
     ないことを結果の文章でも開示する。添字は SHUKU の添字。
     この名は計算の内側と出典の記載(docs/divination-basis.md)でだけ使い、
     画面には出さない(下の SHUKU_KEITOU_PLAIN を参照) */
  var SHUKU_KEITOU_NAME = ['安住', '和善', '急速', '軽燥', '毒害', '猛悪', '剛柔'];

  /* 画面に出す言い換え(Issue #51 の残り・cycle-0057)。
     #51 は「前提知識がない人でも分かるように」「全体的に訂正が必要」というご指示で、
     cycle-0054 では見出し(plain)と呼び名(term)を入れ替えたが、この項目は
     「値」そのものが経典の呼び名のままだった。読み手の画面には
       人との付き合い方の型 … 毒害の型
     と出ており、前提知識のない人には自分が「毒害」「猛悪」だと言われたように読める。
     打ち消しの一文を後ろに置いても、値を目にした瞬間の印象は取り消せない。
     CLAUDE.md の言葉づかいの条項は「値」も対象に挙げており、断定・恐怖を与える
     表現の禁止にも触れるため、値そのものを平易な言い換えへ入れ替える。

     各文は SHUKU_KEITOU_NOTE の前半(=人との距離の取り方)を一語にまとめたもので、
     見出し「人との付き合い方の型」の答えになっている。添字は SHUKU_KEITOU_NAME と
     同じ並び(七科分宿の分類そのものは変えていないので、占いの結果は不変)。
     総合占いへの写し(SHUKU_KEITOU_MAAI / SHUKU_KEITOU_UGOKI)も添字で引くため
     影響しない */
  var SHUKU_KEITOU_PLAIN = [
    '腰を据えて長く付き合う型', /* 安住:人と長く付き合う場で、腰を据えて場を落ち着かせる */
    '場をなだらかにする型',     /* 和善:相手に合わせて場をなだらかにする */
    '流れにすぐ合わせる型',     /* 急速:その場の流れに素早く合わせる */
    '細かく目を配る型',         /* 軽燥:細かなところに目を配りながら間合いを測る */
    'まっすぐ向かう型',         /* 毒害:心を寄せた相手にまっすぐ向かう */
    '自分のやり方を保つ型',     /* 猛悪:自分の歩幅を崩さずに進む */
    '場面で使い分ける型'        /* 剛柔:強さと柔らかさを場面で使い分ける */
  ];
  var SHUKU_KEITOU_INDEX = (function () {
    var members = [
      [1, 9, 18, 23],       /* 安住:畢・翼・斗・壁 */
      [2, 11, 14, 24],      /* 和善:觜・角・房・奎 */
      [5, 10, 25, 26],      /* 急速:鬼・軫・婁・胃 */
      [4, 12, 19, 20, 21],  /* 軽燥:井・亢・女・虚・危 */
      [3, 6, 15, 16],       /* 毒害:参・柳・心・尾 */
      [7, 8, 17, 22],       /* 猛悪:星・張・箕・室 */
      [0, 13]               /* 剛柔:昴・氐 */
    ];
    var out = [];
    for (var g = 0; g < members.length; g++) {
      for (var i = 0; i < members[g].length; i++) { out[members[g][i]] = g; }
    }
    return out;
  })();

  /* 語り口(W8):宿曜の note は対人場面(人と/相手と)から入る。
     各文は二つの面を述べる:前半=人との距離の取り方、後半=事の始め方(腰の上がり方)。
     総合占いはこの二面をそれぞれ「人との間合い」「動き出し方」へ写す(下の
     SHUKU_KEITOU_MAAI と SHUKU_KEITOU_UGOKI が対応表。cycle-0045 で後半を追記した) */
  var SHUKU_KEITOU_NOTE = [
    '人と長く付き合う場では、腰を据えて場を落ち着かせる向き合い方になりやすいと読み取れます。' +
      '始めの一歩は、足場の確かさを見きわめてから置く進み方になりやすいでしょう。',
    '人と向き合う場では、相手に合わせて場をなだらかにする向き合い方になりやすいと読み取れます。' +
      '動き出す時も、周りの気配とそろえながら決めていく形が見えてきます。',
    '人の集まる場では、その場の流れに素早く合わせる向き合い方になりやすいと読み取れます。' +
      '取りかかりは早めで、思い浮かんだことへ間を置かずに手が伸びるようです。',
    '人と交わる場では、細かなところに目を配りながら間合いを測る向き合い方になりやすいと読み取れます。' +
      '動き出す前には、気になった点をひととおり確かめる時間が挟まると読み取れます。',
    '人と深く関わる場では、心を寄せた相手にまっすぐ向かう向き合い方になりやすいと読み取れます。' +
      '事に取りかかるときも、支度が整わないうちから足が先に向いていくと読み取れます。',
    '人の中にあっても、自分の歩幅を崩さずに進む向き合い方になりやすいと読み取れます。' +
      '人に勧められるよりも自分で納得することが先で、納得してから力を出していくと読み取れます。',
    '人と接する場では、強さと柔らかさを場面で使い分ける向き合い方になりやすいと読み取れます。' +
      '踏み出す速さは相手の動き方とその場の流れしだいで決まり、急ぐ場では急ぎ、' +
      '待つ場では待つ形になりやすいでしょう。'
  ];

  /** 本命宿の番号(0=昴宿〜26=胃宿)。旧暦の月の朔日宿から日にちのぶんだけ進める */
  function shukuIndexOf(b) {
    var lunar = lunarDateOf(b);
    return mod(SAKUJITSU_SHUKU[lunar.month - 1] + lunar.day - 1, 27);
  }

  function lunarDateText(lunar) {
    return '旧暦' + (lunar.leap ? '閏' : '') + lunar.month + '月' + lunar.day + '日';
  }

  /* 天中殺と同じく、その項目の中で打ち消しを添える(結びの文だけに頼らない。台帳 OC42-M4)。
     cycle-0057 で値そのものを平易な言い換えへ替えたため、打ち消しの向きも
     「呼び名は評価ではない」から「この型は付き合い方の傾向であって人の評価ではない」へ
     移した(画面に経典の呼び名が出なくなり、「この呼び名」が指す先が無くなったため) */
  var KEITOU_DISCLAIMER = 'この型は人との付き合い方の傾向をまとめた言い方で、人の善し悪しを表すものではありません。';

  /* 昔の暦での生まれた日の欄に置く書き分けの文(cycle-0064・台帳 OC58-2 の #8)。
     「足す」道は取れない=値は lunarDateText(lunar) が組み立てた日付そのもので、
     日付ごとの意味は計算から何も出ず、原典も手元に無い(#45)。150通り以上ある。

     「書き分け」の道は取れる。実装はこの日付から月の居場所を数え
     (shukuIndexOf = mod(SAKUJITSU_SHUKU[lunar.month - 1] + lunar.day - 1, 27))、
     その居場所から付き合い方の型を引く(SHUKU_KEITOU_INDEX[idx])。

     行き先を「生まれた日に月がいた場所」にしてはいけない。その欄自身が
     cycle-0059 の書き分けなので、送ると二段の転送になる(cycle-0060 の監査 R4。
     判定は makePointerCheck の varietyProblems が持つ)。読み解きを実際に持つ
     「人との付き合い方の型」まで詰めて名指しする。画面では下に並ぶので「下の」。

     語り口(W8):宿曜の note は対人場面(人/相手)から書き起こす決まりなので、
     一文目の主語をそこへ置く(tests/wording.spec.js の RULES.sukuyo)。結びは
     算命学の目印「〜と見ます。」を借りないこと(cycle-0064 の監査 R8)。

     数える向きに注意(cycle-0064 の監査 R1):数え始めは「この日付」ではなく
     「その旧暦月の一日(朔日)の宿」で、この日付は何日ぶん進めるかを与える側である
     (SAKUJITSU_SHUKU[lunar.month - 1] + lunar.day - 1)。同じ画面の summary も
     「その月の一日の宿から数えると」と書いており、そちらへ合わせる。
     この向きが計算と合っていることは OC64-9 が結果値だけで確かめる */
  var LUNAR_DAY_NOTE =
    '人との向き合い方を読むもとになる月の居場所は、この月の一日にあたる場所から、日にちのぶんだけ数え進めた先で決まります。' +
    'そこから見えるあなたの向き合い方は、下の「人との付き合い方の型」に書いてあります。' +
    '日付の並びそのものを読むところではなく、どこまで数えるかの目安と見ています。';

  /* 二十七のうちの何番目かの欄に置く文(cycle-0064・台帳 OC58-2 の #12)。
     この欄は cycle-0059 の監査 R1 で「果たせない約束」として登録されていた=
     以前の文は「あなたの番号が分かると、相手との巡り合わせをたどる手がかりに
     なります。」だったが、この画面には相手の生年月日を入れる手立てが無い
     (入力は名前・生年月日・性別・保存可否の4つだけ=CLAUDE.md の絶対条件)。
     読み手は自分では確かめようのないことを約束されていた。

     まず約束を実態へ直し(このアプリは二人の間柄を数えていない)、そのうえで
     書き分ける。行き先は「人との付き合い方の型」で、この番号から直に引ける
     (SHUKU_KEITOU_INDEX[idx]。idx は画面に出ている番号 - 1)。画面では上に並ぶ。

     この文は仮計算(provisional.js)にも同じ項目があるので両実装に同一文で置く。
     片方だけ直すと切替で食い違う(OC59-5・OC61-5・OC62-5 と同じ形。OC64-5 が見る)。

     語り口(W8):宿曜の note は対人場面(人/相手)から書き起こす決まり。
     この欄はまさに「人との間柄」を打ち消すところなので、そこから書き始める */
  var CYCLE_POS_NOTE =
    '人との間柄を数えるための番号ではなく、二十七を並べた輪の上であなたの居場所がどこかを指すものです。' +
    'このアプリは二人ぶんの生まれた日を同時に受け取る欄を持たないので、二人の距離を数えることはしていません。' +
    'あなたの向き合い方そのものは、上の「人との付き合い方の型」に書いてあります。';

  function sukuyoOfficial(b) {
    var lunar = lunarDateOf(b);
    /* 宿の割り当ては shukuIndexOf 1か所を通す(同じ式を二重に書かない。台帳 OC42-M3) */
    var idx = shukuIndexOf(b);
    /* 画面へ出すのは平易な言い換えのほう(cycle-0057)。経典の呼び名 SHUKU_KEITOU_NAME は
       計算の内側と出典の記載でだけ使う */
    var keitou = SHUKU_KEITOU_PLAIN[SHUKU_KEITOU_INDEX[idx]];

    return {
      key: 'sukuyo',
      name: '宿曜',
      /* cycle-0064(監査 R6):以前は「月の巡りと人との相性」だった。同じ画面の
         「二十七のうちの何番目か」で「二人の距離を数えることはしていない」と述べる以上、
         見出しの側で相性を名乗ると読み手はどちらが本当か分からなくなる */
      view: '月の巡りから読む人との向き合い方',
      summary: '生まれた日を月の満ち欠けの暦に直すと' + lunarDateText(lunar) + 'にあたり、' +
               'その月の一日の宿から数えると、月は' + SHUKU[idx] + 'に宿っていたと読み取れます。' +
               keitou + 'に置かれる宿として、人との間にどんな向き合い方が出やすいかを眺めていきます。',
      /* 呼び名の打ち消しは項目の note 側に置く(結びと同じ文を重ねない。wording の重複検査) */
      closing: '宿は月の通り道を二十七に分けて名づけた古い呼び名です。' +
               '人と向き合うときの静かな手がかりの一つとして、そばに置いていただけたらと思います。',
      /* 語り口(W8):宿曜の note は「人」か「相手」から始める。Issue #51 で、
         欄そのものの言い直しで終わっていた3つの note を、その値が読み手にとって
         何を意味するかを述べる形へ書き替えた(「系統」「区分」の語も外した) */
      items: [
        /* cycle-0059(台帳 OC58-1):以前の note は「…はここから読み解いていきます」で
           終わっており、読み手はこの欄に自分の宿の意味が書いてあるものと構えるのに、
           27宿のどれでも同じ文しか出てこなかった。宿ごとの意味の原典が手元に無い以上
           27通りを書き起こすことはできないので、行き先を画面の見出しの言葉で名指しする。
           名指しした先が実在し、そちらが実際に値によって変わることは
           tests/engine.spec.js の OC59-1・OC59-2 が突き合わせる(空手形にしない)。
           名指しは「人との付き合い方の型」1つに絞ってある。はじめは「二十七のうちの
           何番目か」も行き先に挙げていたが、その欄の note は27宿とも同じ定数で、
           しかもこの画面には相手の生年月日を入れる手立てが無いため「相手との巡り合わせを
           たどる手がかり」は果たせない約束だった(cycle-0059 の監査 R1)。
           読み解きを持たない欄へ送るのは、たらい回しであって書き分けではない */
        { label: '生まれの宿', value: SHUKU[idx],
          note: '人とどう向き合いやすいかは、この宿を出発点にして読み解いていきます。あなたの場合にどんな向き合い方になりやすいかは、下の「人との付き合い方の型」に書いてあります。' },
        { label: '旧暦の生まれ日', value: lunarDateText(lunar) +
            (lunar.leap ? '(閏月は同じ番号の月として数えています)' : ''),
          note: LUNAR_DAY_NOTE },
        { label: '宿の系統', value: keitou,
          note: SHUKU_KEITOU_NOTE[SHUKU_KEITOU_INDEX[idx]] + KEITOU_DISCLAIMER },
        { label: '巡りの位置', value: (idx + 1) + ' / 27',
          note: CYCLE_POS_NOTE }
      ],
      provisional: false
    };
  }

  /* ============ 総合占い(正式計算) ============ */

  /* 総合占いは個別占術の文の再掲・連結にしない。中核5占術の「正式計算が出した結果値
     そのもの」(算命学=中心の星と本元の気/九星気学=本命星と月命星/数秘術=数の性質と
     誕生数/西洋占星術=三区分とエレメント/宿曜=宿の系統の二面)を
     「動き出し方」「人との間合い」の2軸へ写して数え、多数派を一致点・少数派を相違点として
     文章を独自に組み立てる。写し先は、その値について個別画面で述べている説明文と向きが
     食い違わないように選んである(下の各表のコメントが対応の根拠)。

     cycle-0048 をもって10行すべてが、その値そのものについて画面の note が述べている
     文言から写される形になった(台帳 OC43-L2 を解消)。最後まで残っていた2行は
     いずれも「添字の値の説明文が画面に無く、隣の項目の文言を読み替えていた」もので、
     値ごとの一文を note へ足してから写し直した:
      ・九星の間合い(KYUSEI_MAAI):添字は月命星。本命星の項目にしか出ない
        KYUSEI_NOTE の読み替えをやめ、月命星の項目へ KYUSEI_GETSUMEI_MAAI_NOTE を足した
      ・数秘の間合い(SUUHI_BIRTH_MAAI):添字は誕生数。ライフパスナンバーの項目にしか
        出ない LIFEPATH_NOTE の当てはめをやめ、誕生数の項目へ SUUHI_BIRTH_MAAI_NOTE を足した
     ここで自ら断っておく(自己申告。台帳 OC48-M1 として登録した):写しの型そのものは
     据え置きで、月命星・誕生数の教義から引き直したわけではない。既存の型に合う一文を
     後から書き足し、画面の側から裏づけられる状態にした、というのが実態である。
     したがって「画面に根拠がある」は満たしたが、「型が文から導かれた」わけではない
     (同種の指摘に OC45-L4 がある)。
     写しの値を動かしていないため、総合占いの出力は変わらない。
     宿曜の動き出しは cycle-0044 まで未根拠に数えていたが、cycle-0045 で
     宿の系統の文(後半=事の始め方)から写す形に取り直した。

     取り直した7行のうち剛柔と毒害の2つは、文から向きへの導出が弱いままだったため
     (cycle-0045 の監査 M1・M2)、cycle-0046 で文の側を書き替えて処置した:
      ・剛柔:速さが移り変わることだけを述べ「何に合わせるか」が無く、動き出しの軸に
        「変える」型が無いぶん消去法で「合わせる」へ落ちていた。速さを決めるもの
        (相手の動き方とその場の流れ)を文に書き、そこから合わせるが読めるようにした
      ・毒害:「心が決まってからの運びは速く」と関門を含むため、猛悪の
        「納得してから力を出していく」(=確かめる)と同じ形の文でありながら
        逆の「先へ動く」へ写していた。関門を外し、支度を待たずに足が向くという
        始め方だけを述べる文に改めた。この辻褄は検査 OC43-L2 の (5) が見張る
     なお同じ語(「筋を通す」「任される」)が占術をまたいで別の型へ写っている組がある。
     これは占術ごとの文脈で読み分けた結果で、語だけを見ると導出が追いにくい(台帳 OC43-L3)。

     文言は仮計算側と同じ表を持つ二重管理になる(台帳 OC35a-L1 と同じ扱い)。
     組み立ての分岐そのものも provisional.js と重複している(台帳 OC43-L1)。 */

  var KANJI_KAZU = ['〇', '一', '二', '三', '四', '五'];

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

  /* 算命学:中心の星(十大主星)を動き出しに写す。添字は TEN_STAR の並び。
     根拠は MAIN_STAR_NOTE の各文:
     貫索=自分の間合いで続ける→確かめる/石門=人の輪で周りに合わせる→合わせる/
     鳳閣=肩の力を抜いて楽しみに変える→合わせる/調舒=静かな場で細やかに言葉へ→確かめる/
     禄存=手元のものを人へ差し出す→先へ動く/司禄=地道に積み重ねる→確かめる/
     車騎=迷いを置かずまっすぐ動く→先へ動く/牽牛=任される役目を果たす→合わせる/
     龍高=知らない場所へ出る→先へ動く/玉堂=学びを積み筋道を立てる→確かめる */
  var SANMEI_UGOKI = [1, 2, 2, 1, 0, 1, 0, 2, 0, 1];

  /* 算命学:本元の気(五行)を間合いに写す。添字は 0=木 1=火 2=土 3=金 4=水。
     根拠は GOGYO_NOTE:木=上へ育てる(手をかける距離)→近づく/火=場を照らす→近づく/
     土=足元を固める→見渡す/金=形を整える仕上げ→見渡す/水=流れに合わせる→変える */
  var SANMEI_GOGYO_MAAI = [0, 0, 1, 1, 2];

  /* 九星気学:本命星(1〜9)を動き出しに写す。根拠は KYUSEI_NOTE:
     一白=流れに沿って動く→合わせる/二黒=手間のかかる役を引き受ける→確かめる/
     三碧=思いついたことを先に口へ出す→先へ動く/四緑=人と人をつなぐ→合わせる/
     五黄=中心に置かれて任される→先へ動く/六白=筋を通す→確かめる/
     七赤=場を和ませる言葉→合わせる/八白=積み重ねが変わり目で形になる→確かめる/
     九紫=目立つ場所へ押し出される→先へ動く */
  var KYUSEI_UGOKI = [2, 1, 0, 2, 0, 1, 2, 1, 0];

  /* 九星気学:月命星(1〜9)を間合いに写す。根拠は月命星の項目に出る
     KYUSEI_GETSUMEI_MAAI_NOTE の一文(cycle-0048 で追加。台帳 OC43-L2 の残り)。
     それまでは本命星の項目にしか出ない KYUSEI_NOTE を読み替えていた:
     一白=近さを移し変えていく→変える/二黒=そばで引き受けながら距離を縮める→近づく/
     三碧=自分から先に声をかけて懐へ入る→近づく/
     四緑=間に入る組み合わせが替わるたびに近さを取り直す→変える/
     五黄=寄る前に場の全体を眺める→見渡す/六白=踏み込みすぎない間を空けて向き合う→見渡す/
     七赤=言葉を交わしながら親しくなる→近づく/八白=一歩引いた位置から人を見る→見渡す/
     九紫=出るたびに近さがひとりでに移り変わる→変える。
     四緑・八白・六白・九紫の4文は cycle-0048 の監査(中2・中3・軽微11)を受けて書き替えた。
     八白は旧文が「時をかけて見定めてから関わる」で、距離ではなく時機を述べており
     同じ星の動き出し(確かめる)と同趣旨になっていた。四緑は旧文が他者どうしの仲立ちを
     述べるだけで、自分の近さが移り変わることを言えていなかった。六白と九紫は
     誕生数4・5の文と言い回しが近すぎたため、占術ごとの差が出る書き方へ改めた */
  var KYUSEI_MAAI = [2, 0, 0, 2, 1, 1, 0, 1, 2];

  /* 数秘術:誕生数を間合いに写す。根拠は誕生数の項目に出る
     SUUHI_BIRTH_MAAI_NOTE の一文(cycle-0048 で追加。台帳 OC43-L2 の残り)。
     それまではライフパスナンバーの項目にしか出ない LIFEPATH_NOTE を当てはめていた:
     1=後ろに続く全体が見える距離を保つ→見渡す/2=すぐそばで受け答えする→近づく/
     3=自分から入り込んでいく→近づく/4=一定の距離を置いたまま向き合う→見渡す/
     5=場が替わるたびに近さを取り替える→変える/6=手元まで寄って世話を焼く→近づく/
     7=一人になれる距離を残す→見渡す/8=輪の外側から流れをつかむ→見渡す/
     9=相手が替わるたびに近さの取り方も入れ替わる→変える/11=気配のぶんだけ間が縮む→近づく/
     22=遠くまで見通せる場所から組み立てる→見渡す。
     誕生数は生まれた日(1〜31)を縮めた数なので、現れるのは 1〜9・11・22 のいずれか。
     1・9・11 の3文は cycle-0048 の監査(中4・中6)を受けて書き替えた。1と9は
     総合側の軸の言い回し(全体を見渡す・距離を取り直す)をほぼ引き写しており、
     根拠が軸の文言のコピーになっていた。11 はライフパスナンバーの文と
     書き出し12文字が一致し、同じ画面の隣り合う項目で重複していた */
  var SUUHI_BIRTH_MAAI = { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2, 6: 0, 7: 1, 8: 1, 9: 2, 11: 0, 22: 1 };

  /* 西洋占星術:エレメントを間合いに写す。添字は ELEMENT の並び(火地風水)。
     根拠は ELEMENT_NOTE:火=熱を分けて場をあたためる→近づく/地=手で触れられる形にする→見渡す/
     風=言葉にして人と分け合う→近づく/水=場の空気を受け取ってから動く→変える。
     動き出しは三区分(MODE)がそのまま対応する(活動=先へ動く・不動=確かめる・柔軟=合わせる) */
  var SEIYOU_ELEMENT_MAAI = [0, 1, 0, 2];

  /* 宿曜:宿の系統(七科分宿)を間合いに写す。添字は SHUKU_KEITOU_NAME の並び。
     根拠は SHUKU_KEITOU_NOTE(いずれも対人の場を述べた文):
     安住=長く付き合う場で腰を据える→近づく/和善=相手に合わせて場をなだらかに→変える/
     急速=その場の流れに素早く合わせる→変える/軽燥=目を配りながら間合いを測る→見渡す/
     毒害=心を寄せた相手にまっすぐ向かう→近づく/猛悪=自分の歩幅を崩さず進む→見渡す/
     剛柔=強さと柔らかさを場面で使い分ける→変える。
     系統の名は経典の古い呼び名であって評価ではない(その断りは宿曜の結果側に置く)。
     cycle-0057 からこの名は画面に出さず、写しの添字としてだけ使う */
  var SHUKU_KEITOU_MAAI = [0, 2, 2, 1, 0, 1, 2];

  /* 宿曜:宿の系統を動き出しに写す。添字は SHUKU_KEITOU_NAME の並び。
     根拠は SHUKU_KEITOU_NOTE の後半(事の始め方を述べた文):
     安住=足場の確かさを見きわめてから置く→確かめる/和善=周りの気配とそろえながら決めていく→合わせる/
     急速=間を置かずに手が伸びる→先へ動く/軽燥=気になった点を確かめる時間が挟まる→確かめる/
     毒害=支度が整わないうちから足が先に向く→先へ動く/
     猛悪=自分で納得してから力を出す→確かめる/
     剛柔=踏み出す速さが相手の動き方とその場の流れしだいで決まる→合わせる。
     cycle-0046 で毒害と剛柔の2文を書き替えた(台帳 OC45-M1/M2)。毒害は
     「心が決まってからの運びは速く」と、事に取りかかる前の関門を述べる文だったため、
     同じく関門を述べる猛悪(納得してから)が確かめるへ写るのと辻褄が合わなかった。
     関門を外し、支度を待たずに足が向くという始め方だけを述べる文に改めた。
     剛柔は速さが移り変わることだけを述べ「何に合わせるのか」を欠いていたため、
     動き出しの3型に「変える」が無いぶん消去法で合わせるへ落ちていた。
     速さを決めるもの(相手の動き方とその場の流れ)を文に書き、写しの根拠を文の側に置いた。
     cycle-0044 までは二十七宿の輪を三分した位置(Math.floor(shuku/9))から写していたが、
     あの区切りは SHUKU の並びを昴宿起点に置いた実装上の区分で、宿曜の教義にも画面の
     説明文にも根拠が無かった(台帳 OC43-L2)。宿曜の結果値のうち人の振る舞いを述べて
     いるのは宿の系統だけなので、系統の文に始め方の一面を足したうえでそこから写す */
  var SHUKU_KEITOU_UGOKI = [1, 2, 0, 1, 0, 1, 2];

  /** 中核5占術の正式な結果値を2軸の型(0/1/2)に写す */
  function overallStancesOf(b) {
    var core = sanmeiCoreOf(b);
    var stars = kyuseiStarsOf(b);
    var life = lifePathOf(b);
    var birth = reduceKeepMaster(b.day);
    var master = (life === 11 || life === 22 || life === 33);
    var order = sunSignIndexOf(b);
    var shuku = shukuIndexOf(b);

    return [
      { name: '算命学', ugoki: SANMEI_UGOKI[core.centerStarIdx], maai: SANMEI_GOGYO_MAAI[core.gogyoIdx] },
      { name: '九星気学', ugoki: KYUSEI_UGOKI[stars.honmei - 1], maai: KYUSEI_MAAI[stars.getsumei - 1] },
      /* 数秘術:「数の性質」の項目がそのまま動き出しを述べている(奇数=自分から先に動く→
         先へ動く/偶数=周りとつり合いを取る→合わせる)。ゾロ目は「力の出し方に波が出る」
         という説明に合わせ、波が引くのを待ってから動き出す=確かめるに写す */
      { name: '数秘術', ugoki: master ? 1 : (life % 2 === 1 ? 0 : 2), maai: SUUHI_BIRTH_MAAI[birth] },
      { name: '西洋占星術', ugoki: order % 3, maai: SEIYOU_ELEMENT_MAAI[order % 4] },
      /* 宿曜:2軸とも「宿の系統」から写す。系統の文が前半で人との距離、後半で事の
         始め方を述べており、その二面をそれぞれの軸に対応させている(上の2表)。
         「巡りの位置」は総合には使わない(位置そのものを振る舞いへ写す根拠が無いため) */
      { name: '宿曜', ugoki: SHUKU_KEITOU_UGOKI[SHUKU_KEITOU_INDEX[shuku]],
        maai: SHUKU_KEITOU_MAAI[SHUKU_KEITOU_INDEX[shuku]] }
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

  function overallOfficial(b) {
    var stances = overallStancesOf(b);
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
         二手に分かれている事実をそのまま書く */
      agreeBody.push(agreeAxis.label + 'をめぐっては、五つの見方が二つ・二つ・一つと別の向きに分かれており、そのうち' +
        join(agreeT.names) + 'は「' + agreeCat.phrase + '」という向きで並んでいます。');
      agreeBody.push('同じ数だけ別の向きへ寄る組み合わせもあるため、はっきりした芯というより、いくつかの小さなまとまりが並んでいる状態だと読み取れます。');
    }

    var differBody = [];
    var differCat = differAxis.cats[differT.top];
    if (differT.minors.length === 0) {
      /* 5票が1つの型にそろう分岐。文末は「〜ません」で締める(「見当たりませんでした」は
         禁止語表の /当た(る|り)ま/ に当たり、文末も です・ます調の検査から外れる。
         cycle-0043 の監査で実際に到達する9日付が見つかったため書き換えた) */
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
      /* Issue #51:書き出しの列挙から「三区分」「宿の系統」という占いの用語を外し、
         項目名を並べるのをやめて「動き出し方」「人との間合い」という総合占い自身の
         二つの軸だけを述べる形にした(cycle-0057 の監査 R8:以前ここには「画面の値と
         同じ言い方(星座の型・宿の型)へそろえた」と書いてあったが、下の summary には
         どちらの語も出てこない=説明と実物が食い違っていた。cycle-0058 で書き直し)。
         項目名(label)そのものは engine/index.js の GUIDE が項目名で引く作りのため
         動かしていない */
      summary: '五つの読み解きを正式な計算でそろえたうえで、それぞれの画面に出ている' +
               '結果そのものから向きを取り出し、一枚に重ねました。' +
               'そろって同じ向きを指すところと、それぞれ別の向きを指すところが見えてきます。' +
               'ここでは「動き出し方」と「人との間合い」の二つの軸から、その重なりと食い違いを眺めていきます。',
      sections: [
        { heading: '重なって見えるところ(一致点)', body: agreeBody },
        { heading: '食い違って見えるところ(相違点)', body: differBody }
      ],
      /* ラベルは個別占術(算命学の「人との間合い」等)と重ねない。総合は多数派の
         「寄り」を示すもので、個別の値と向きが違っても矛盾ではないため、名前でも区別する */
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
      provisional: false
    };
  }

  /* ============ 追加占術:姓名判断(正式計算・工程2の骨組み) ============
   *
   * 工程2は「骨組みだけを作る」工程で、画面は1文字も変わりません。
   * seimei は AVAILABLE_KEYS に無いので supports('seimei') は偽のままで、
   * computeOne は null を返し、engine/index.js が仮計算へ戻します(切替は工程6)。
   *
   * ここに置くのは docs/seimei-dictionary-plan.md 7-2 節の R1・R2・R4 だけです。
   *
   * 【この表は仮計算(provisional.js)にも同じものがあります】
   * 仮計算と正式計算はコード上分離する(CLAUDE.md の絶対条件)ため、工程2では
   * provisional.js から表を取り上げず、同じ内容をこちらにも持ちます。二重管理が
   * 黙って食い違うことだけは避けたいので、tests/seimei.spec.js の SEIMEI2-1 が
   * 両ファイルの表を1字1値まで突き合わせます(片方だけ直すと必ず落ちる)。
   * 工程6で seimei を正式計算へ切り替えたあと、仮計算側の表を落とします。
   *
   * 【値の出典はまだありません(未確認)】
   * 表の値そのものは仮計算から引き継いだもので、実装コメントは「一般的な画数表の
   * とおり」としか述べておらず、どの表かが分かりません(7-4 節の宿題)。工程3で
   * V1(1字につき2通りで突き合わせる)をかなにも適用して確かめます。
   */

  /* R4:かな・長音記号の画数表(115字=ひらがな57・カタカナ57・長音記号1)。
     濁点・半濁点の付いた字は表に持たず、下の kanaStrokesOf が
     「もとの字 + 濁点2画 / 半濁点1画」で組み立てる */
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

  /* 分けて書いたときの濁点・半濁点(NFD で切り出される結合文字)の符号位置 */
  var COMBINING_DAKUTEN = 0x3099;
  var COMBINING_HANDAKUTEN = 0x309A;
  /* R4 の加算値。濁点は2画・半濁点は1画 */
  var DAKUTEN_STROKES = 2;
  var HANDAKUTEN_STROKES = 1;

  /** R1・R2:名前を数える文字の並びに直す。
   *  R1 = 先に NFKC 正規化をかけて「同じ字の別の書き方」をそろえる
   *       (半角カナ「ｶ」→「カ」、「か+結合濁点」→「が」、互換漢字→統合先の字)。
   *       旧字体を新字体へ読み替えることはしない(R3。NFKC はその置き換えをしない)
   *  R2 = 空白は数えない
   *  サロゲートペアの字は1文字として扱う。
   *  @param {string} name 占いたい名前
   *  @returns {string[]} 数える対象の文字の並び
   */
  function seimeiCharsOf(name) {
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

  /** R4:かな1文字ぶんの画数。
   *  表にそのまま載っていればその値、濁点・半濁点つきの字は
   *  「もとの字 + 2画 / + 1画」で組み立てる。
   *  かな以外(漢字・ラテン文字・記号など)は **値を作らず null を返す**。
   *  漢字の表は工程4(R5)、表に無い文字の画面での扱いは工程3・工程5(R6・R7)。
   *  @param {string} ch 1文字(呼ぶ側で NFKC 済みであることを前提とする)
   *  @returns {number|null} 画数。この表で数えられない文字は null
   */
  function kanaStrokesOf(ch) {
    var s = String(ch == null ? '' : ch);
    if (s === '') { return null; }
    if (Object.prototype.hasOwnProperty.call(KANA_STROKES, s)) { return KANA_STROKES[s]; }
    if (typeof s.normalize !== 'function') { return null; }
    var parts = s.normalize('NFD');
    if (parts.length <= 1) { return null; }
    var base = parts.charAt(0);
    if (!Object.prototype.hasOwnProperty.call(KANA_STROKES, base)) { return null; }
    var extra = 0;
    for (var i = 1; i < parts.length; i++) {
      var code = parts.charCodeAt(i);
      if (code === COMBINING_DAKUTEN) { extra += DAKUTEN_STROKES; }
      else if (code === COMBINING_HANDAKUTEN) { extra += HANDAKUTEN_STROKES; }
      else { return null; }  /* 知らない結合文字が付いていたら値を作らない */
    }
    return KANA_STROKES[base] + extra;
  }

  /* ============ 入口 ============ */

  function supports(key) { return AVAILABLE_KEYS.indexOf(key) >= 0; }

  /** 総合占いを正式計算で組めるか。中核5占術がすべて正式計算で実装済みのときだけ真 */
  function supportsOverall() {
    for (var i = 0; i < CORE_KEYS.length; i++) {
      if (!supports(CORE_KEYS[i])) { return false; }
    }
    return true;
  }

  function computeOne(key, input) {
    if (!supports(key)) { return null; }
    var b = parseDate(input && input.birthdate);
    if (!b) { return null; }
    if (key === 'sanmei') { return sanmeiOfficial(b); }
    if (key === 'kyusei') { return kyuseiOfficial(b); }
    if (key === 'suuhi') { return suuhiOfficial(b); }
    if (key === 'seiyou') { return seiyouOfficial(b); }
    if (key === 'sukuyo') { return sukuyoOfficial(b); }
    return null;
  }

  /* 一括計算は engine/index.js が占術ごとに切り替えて行うため、このファイルでは持たない */
  function computeAll(input) { return null; }

  function computeOverall(input) {
    if (!supportsOverall()) { return null; }
    var b = parseDate(input && input.birthdate);
    if (!b) { return null; }
    return overallOfficial(b);
  }

  return {
    mode: 'official',
    availableKeys: AVAILABLE_KEYS.slice(),
    coreKeys: CORE_KEYS.slice(),
    supports: supports,
    supportsOverall: supportsOverall,
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
      /* 総合占い(正式計算)の検証用。2軸への写しと集計を検査から直接確かめる */
      sanmeiCoreOf: sanmeiCoreOf,
      kyuseiStarsOf: kyuseiStarsOf,
      overallStancesOf: overallStancesOf,
      tallyAxis: tallyAxis,
      overallAxes: OVERALL_AXES,
      sunLongitudeAtNoonJst: sunLongitudeAtNoonJst,
      sunSignIndexOf: sunSignIndexOf,
      /* 正午の前後を走査して替わり目の時刻を求める検査のために公開する(台帳 OC40a-M2) */
      jdOfUt: jdOfUt,
      deltaTSec: deltaTSec,
      signOrder: SIGN_ORDER.slice(),
      /* 宿曜(旧暦と朔)の検証用 */
      newMoonJde: newMoonJde,
      newMoonDayNo: newMoonDayNo,
      newMoonIndexOnOrBefore: newMoonIndexOnOrBefore,
      winterSolsticeDayNo: winterSolsticeDayNo,
      lunarDateOf: lunarDateOf,
      shukuIndexOf: shukuIndexOf,
      shukuOrder: SHUKU.slice(),
      sakujitsuShuku: SAKUJITSU_SHUKU.slice(),
      /* 姓名判断(工程2の骨組み)の検証用。切替はしていないので computeOne からは
         呼ばれず、いまはここからだけ触れる(tests/seimei.spec.js の SEIMEI2-*) */
      seimeiCharsOf: seimeiCharsOf,
      kanaStrokesOf: kanaStrokesOf,
      /* 算命学の二文字ごとの読み(#55・工程1の器)の検証用。切替はしていないので
         computeOne からは呼ばれず、いまはここからだけ触れる(tests/sanmei.spec.js) */
      kanshiKeys: KANSHI_KEYS.slice(),
      kanshiFields: KANSHI_FIELDS.slice(),
      kanshiYomiOf: kanshiYomiOf,
      kanshiYomiProgress: kanshiYomiProgress,
      kanshiRepetition: kanshiRepetition,
      kanshiRepetitionOf: kanshiRepetitionOf,
      kanshiLimits: { average: KANSHI_LIMITS.average, max: KANSHI_LIMITS.max },
      /* 4節の5つの手がかり。読みを書くときの根拠で、検査 SANMEI1-1 が
         「60通りと1対1」であることをこの関数の出力から数える */
      kanshiTraitsOf: kanshiTraitsOf,
      kanaStrokes: (function () {
        var copy = {};
        for (var k in KANA_STROKES) {
          if (Object.prototype.hasOwnProperty.call(KANA_STROKES, k)) { copy[k] = KANA_STROKES[k]; }
        }
        return copy;
      })()
    }
  };
});
