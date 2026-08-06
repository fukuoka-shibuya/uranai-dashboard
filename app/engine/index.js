/* 占術エンジンの切替点
 *
 * 仮計算(provisional.js)と正式計算(official.js)のどちらを使うかを決める
 * 場所は、このファイルの OFFICIAL_KEYS 一か所だけです。画面側(app/index.html)は
 * UranaiEngine.computeOne / computeAll / computeOverall だけを呼び、どちらが
 * 動いているかを意識しません。
 *
 * Issue #35(2026-08-04 オーナー指示)により、正式計算は1サイクル1占術ずつ
 * 切り替えます(算命学→九星気学→数秘術→西洋占星術→宿曜)。切り替え済みの
 * 占術だけが official.js で計算され、残りは従来どおり仮計算で動きます。
 */
(function (root, factory) {
  var provisional = (typeof module === 'object' && module.exports)
    ? require('./provisional.js') : root.UranaiProvisional;
  var official = (typeof module === 'object' && module.exports)
    ? require('./official.js') : root.UranaiOfficial;

  var api = factory(provisional, official);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (provisional, official) {
  'use strict';

  /* 正式計算へ切り替え済みの占術。ここに足すことが「切り替え」のすべて。
     official.js 側に実装が無い占術を誤って足しても、下の implFor が
     supports() で確かめてから使うため、画面が止まることはない */
  var OFFICIAL_KEYS = ['sanmei', 'kyusei', 'suuhi', 'seiyou', 'sukuyo'];

  /** その占術で実際に使う実装を返す。正式計算が未実装なら仮計算へ戻す */
  function implFor(key) {
    if (OFFICIAL_KEYS.indexOf(key) >= 0 &&
        official && typeof official.supports === 'function' && official.supports(key)) {
      return official;
    }
    return provisional;
  }

  /** 総合占いをどちらで組むか。
      総合は中核5占術の計算値を束ねる上位の読み物なので、1つでも仮計算のままだと
      仮と正式の値が混ざる。全部そろってから正式計算へ渡し、それまでは仮計算で
      一貫させる(安全側)。official 側に総合の実装が無い場合も仮計算へ戻す */
  function overallImpl() {
    for (var i = 0; i < provisional.order.length; i++) {
      if (implFor(provisional.order[i]) !== official) { return provisional; }
    }
    if (official && typeof official.supportsOverall === 'function' && official.supportsOverall()) {
      return official;
    }
    return provisional;
  }

  /** key を渡すとその占術が仮計算かどうか。渡さないと「仮計算が1つでも残っているか」
      (総合占いも数える。以前はここが恒 true だった=台帳 OC35a-L4) */
  function isProvisional(key) {
    if (key) { return implFor(key) === provisional; }
    var keys = provisional.order.concat(provisional.extraOrder || []);
    for (var i = 0; i < keys.length; i++) {
      if (implFor(keys[i]) === provisional) { return true; }
    }
    return overallImpl() === provisional;
  }

  /* ---------- 占いの案内(Issue #50・2026-08-06 オーナー指示) ----------
     「この文章自体が何を意味しているのか分からない。私の性格を表しているのか今年の運勢な
     のかも分からない。『中心の星』がそもそも何なのかも分からない」という指摘への対応。

     これまで画面に出ていたのは「その人の値がどういう意味か」(items[].note)だけで、
       (1) その占いがそもそも何を読むものなのか
       (2) 項目名(用語)そのものが何を指すのか
     が どこにも無かった。この2つを READING / ABOUT として添える。

     この2つは「値によらず一定の説明」なので、仮計算と正式計算のどちらが動いていても
     同じ文になる。だからこそ実装の分かれ道ではなく、両方の合流点であるこのファイルに
     置く(provisional.js と official.js に分けて持つと二重管理になり、切替のたびに
     説明だけ古くなる。台帳 OC48-L1 と同じ失敗を繰り返さないための置き場所)。
     ABOUT は項目名で引くので、仮計算だけにある項目名(気の配り方・人との間合い など)も
     正式計算だけにある項目名(年の干支・月の干支 など)も両方そろえてある。 */
  var READING = {
    sanmei: '算命学は、生まれた日を昔ながらの暦の干支に写して、その人が生まれつき持っている気の配り方や動き方の型を読むものです。その年その日の出来事を言い当てるものではなく、変わりにくい持ち味のほうを眺める見方と見ます。',
    kyusei: '九星気学は、立春で年を、節入りで月を区切る暦をたどり、その巡りの中で自分がどこに置かれやすいかを読むものです。生まれ持った性格そのものや、日々の出来事の先ゆきを告げるものではないとされています。',
    suuhi: '数秘術は、生年月日の数字を作法どおりに足して一つの数へ縮め、その数に置きかえた性質を読むものです。その年の運勢や先の出来事を数から言い当てるものではなく、日々の選び方に出る癖を眺める見方と読み取れます。',
    seiyou: '西洋占星術は、生まれた日に太陽が空のどこにあったかを計算し、そこから見える力の出やすい場面を読むものです。今日や今年の運勢を空から告げるものではなく、生まれた日の眺めを手がかりにする見方でしょう。',
    sukuyo: '宿曜は、生まれた日を月の満ち欠けの暦に直し、月がどの宿に宿っていたかから人との間に流れる調子を読むものです。相手との相性の良し悪しを決めつけたり、先の出来事を告げたりするものではないと読み取れます。',
    seimei: '姓名判断は、占いたい名前の画数を数え合わせて、その名前がまとう雰囲気を読むものです。名前で人の値打ちや先ゆきが決まるという見方ではなく、呼び名の手触りを眺めるものと映ります。'
  };

  var ABOUT = {
    sanmei: {
      '日の干支': '生まれた日そのものを、昔ながらの暦にならって十干十二支の二文字で言い表した柱です。',
      '中心の星': '生まれた日の柱を軸に置き、その人の動き方の型を十大主星という星の名で一つ表したものです。',
      '年の干支': '生まれた年を立春で区切る暦で数え、干支の二文字に写した柱です。',
      '月の干支': '節入りを境に区切った生まれ月を、同じく干支の二文字へ写した柱です。',
      '本元の気': '日の干支の十干を木・火・土・金・水の五行に当てはめ、気の向かう先を一字で示したものです。',
      '気の配り方': 'その人の気がどの範囲へどう向かいやすいかを、四つの型に分けて見る項目です。',
      '人との間合い': '相手とのあいだにふだんどれくらいの距離を取りやすいかを、三つの型で見ます。',
      '動き出しの型': '物事に取りかかるまでの間の置き方を、三つの型に分けて見る項目です。',
      '天中殺の組': '日の干支を十日ごとに区切ったとき、その組に入らない二つの支を名づけた算命学の区分です。'
    },
    kyusei: {
      '本命星': '生まれた年を立春で区切って数え、九つの星のどれに当たるかを示したものです。',
      '月命星': '生まれた月を節入りで区切って数え、その月の盤の中心に座る星を示したものです。',
      '星の色': '九つの星それぞれに古くから結び付けられている色で、星の名にも入っています。',
      '定位の方角': '九星の盤の上で、その星がもともと座るとされる位置の方角です。'
    },
    suuhi: {
      'ライフパスナンバー': '生年月日の数字をすべて足し、一桁になるまで縮めて出した数で、数秘術ではこれを読み解きの軸に置きます。',
      '誕生数': '生年月日のうち日にちの部分だけを取り出し、同じ作法で縮めた数の呼び名です。',
      '数の性質': 'ライフパスナンバーが偶数か奇数か、ゾロ目かという数そのものの並びの区分です。',
      '数の重なり': 'ライフパスナンバーと誕生数が同じ数かどうかという、二つの数の関係を見る項目です。'
    },
    seiyou: {
      '太陽星座': '生まれた日に太陽が黄道のどの区画にあったかを、十二の星座の名で表したものです。',
      'エレメント': '十二星座を火・地・風・水の四つに分けた、古くからの組分けです。',
      '三区分': '十二星座を活動・不動・柔軟の三つに分ける、力の出方の区分です。',
      '向かい合う星座': '空の輪の上で、太陽星座のちょうど反対側に置かれる星座のことです。'
    },
    sukuyo: {
      '生まれの宿': '二十七に分けた月の通り道のうち、生まれた日の月が宿っていたとされる区画の名です。',
      '旧暦の生まれ日': '生年月日を月の満ち欠けを基にした昔の暦に直した日付で、宿を数える起点になります。',
      '宿の系統': '二十七の宿を七つのまとまりに分けた、宿曜経に伝わる古い組分けの名です。',
      '巡りの位置': '二十七の宿を順に並べた輪の中で、生まれの宿が何番目に当たるかを示す数です。',
      '人との調子': '相手と向き合ったときに流れやすい調子を、三つの言い方に分けた区分です。'
    },
    seimei: {
      '総画': '入力された名前を一字ずつ画数に置きかえ、その合計として出した数です。',
      '画の型': '総画を一桁になるまで足し縮め、一から九のどれに当たるかで見る型です。',
      '頭字の画': '名前のいちばん初めの一字が持つ画数で、出だしの印象を見る手がかりにします。',
      '結字の画': '名前の最後に置かれた一字の画数で、結びの印象を読むところです。'
    }
  };

  function own(obj, name) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, name);
  }

  /** 計算結果へ案内(reading・items[].about)を添える。
      元のオブジェクトは書き換えず写しを返す(実装側が表を使い回していても汚さない) */
  function withGuide(key, result) {
    if (!result || typeof result !== 'object') { return result; }
    var out = {}, name;
    for (name in result) { if (own(result, name)) { out[name] = result[name]; } }
    if (READING[key]) { out.reading = READING[key]; }
    var table = ABOUT[key];
    if (Object.prototype.toString.call(result.items) === '[object Array]') {
      out.items = result.items.map(function (item) {
        var copy = {}, p;
        for (p in item) { if (own(item, p)) { copy[p] = item[p]; } }
        if (table && own(table, item.label)) { copy.about = table[item.label]; }
        return copy;
      });
    }
    return out;
  }

  /** 生年月日が読み取れる形かどうか。理由の文言も返す */
  function validate(input) {
    if (!input || !input.birthdate) {
      return { ok: false, message: '生年月日を入れていただくと読み解けます。' };
    }
    if (!provisional.util.parseDate(input.birthdate)) {
      return { ok: false, message: '生年月日の形が読み取れませんでした。もう一度お確かめください。' };
    }
    return { ok: true, message: '' };
  }

  function computeOne(key, input) { return withGuide(key, implFor(key).computeOne(key, input)); }

  function computeAll(input) {
    var out = {};
    for (var i = 0; i < provisional.order.length; i++) {
      out[provisional.order[i]] = computeOne(provisional.order[i], input);
    }
    return out;
  }

  return {
    /* 全占術が正式計算へ切り替わるまでは 'mixed'(混在)。切替の実体は OFFICIAL_KEYS */
    mode: OFFICIAL_KEYS.length === 0 ? 'provisional' : 'mixed',
    officialKeys: OFFICIAL_KEYS.slice(),
    order: provisional.order.slice(),
    extraOrder: (provisional.extraOrder || []).slice(),
    isProvisional: isProvisional,
    validate: validate,
    computeOne: computeOne,
    computeAll: computeAll,
    /* Issue #50 の案内。検査から表そのものを引けるようにする(画面と同じ出どころ) */
    readingOf: function (key) { return READING[key] || ''; },
    aboutOf: function (key, label) {
      return (ABOUT[key] && own(ABOUT[key], label)) ? ABOUT[key][label] : '';
    },
    /* 中核5占術がすべて正式計算に切り替わったので、総合占いも正式計算側で組む
       (cycle-0043)。切替の実体は上の OFFICIAL_KEYS のままで、ここに別の設定は置かない */
    overallIsOfficial: function () { return overallImpl() === official; },
    computeOverall: function (input) { return overallImpl().computeOverall(input); }
  };
});
