/* 総合占いのAI生成:送る指示文の組み立てと、失敗したときの戻り先(工程3)
 *
 * オーナーコメント #72(2026-08-12)で承認された中継役へ、総合占いの読み物を
 * 頼むための指示文を組み立てる部品です。決めごと・工程表は
 * docs/ai-overall-plan.md の1か所にあります。
 *
 * この部品が守ること
 *   - 送るのは**2軸の寄り(型と、そろっているか二手に分かれているか)だけ**(D1)。
 *     この粒度は 20,496日を走査して選んだもので、**生年月日が一意に決まる日は0日**。
 *     いまの総合占いの本文(どの占術がどちらへ寄っているかを名前で挙げる文)を
 *     そのまま送ると **6,942日が一意に決まる**ので、本文は送らない(4節)
 *   - 送ってよい値を**顔ぶれで列挙**し、知らない値が来たら送らない(安全側)
 *   - 名前・生年月日・性別・保存したプロフィールは受け取りもしない
 *     (この部品の入口は総合占いの結果オブジェクト1つだけで、入力を受け取らない)
 *   - 中継役が使えないときの戻り先は、**いま画面に出ている決定論的な文そのもの**(D4)
 *   - 同じ見立ての返りはその起動の間だけ持ち、1回しか呼ばない(D7)
 *   - **門を通していない文を `text` という名で返さない**。中継役が書いた文は
 *     `aiText`、こちらの文は `fallbackText` という別の名で返し、
 *     どちらを画面へ出すかは工程4の門を通してから決めさせる
 *
 * この部品は画面へまだつながっていません(工程4でつなぎます)。
 */
(function (root, factory) {
  var relay = (typeof module === 'object' && module.exports)
    ? require('./ai-relay.js') : root.UranaiAiRelay;

  var api = factory(relay);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiAiOverall = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (relay) {
  'use strict';

  /* 送ってよい値の顔ぶれ(D1 の実体)。
     総合占いの結果の items から引ける2欄だけを送り、**表に無い値は送らない**。
     official.js の OVERALL_AXES と同じ文字を持つ二重管理だが、ここは
     「送ってよいものの一覧」であって計算の表ではない=実装の表を直に読むと、
     向こうへ値が1つ足された日に黙って新しい値が外へ出ていく。
     二重管理が食い違うことは tests/ai-overall.spec.js の AI3-2 が
     20,496日の走査で両側を突き合わせて塞ぐ */
  var SEND_AXES = [
    { key: 'ugoki', label: '動き出しの寄り', ask: '動き出し方の寄り',
      values: ['先へ動く流れ', '確かめる流れ', '合わせる流れ'] },
    { key: 'maai', label: '間合いの寄り', ask: '人との間合いの寄り',
      values: ['近づく間合い', '見渡す間合い', '変える間合い'] }
  ];

  /* 「五つの見方がそろっているか、二手に分かれているか」を、いま画面に出ている
     note の言い方から見分ける目印。official.js / provisional.js のどちらも
     票数が2のときだけ「わずかに」と書き、3つ以上のときは「寄っており」または
     「指しており」と書く(実測)。
     **どちらの目印も見つからなければ値を作らない**(null を返す)=言い方が
     変わった日に、こちらが黙って逆の意味で送り続けることを防ぐ。
     言い方が変わったことは AI3-2 の走査が必ず赤で知らせる */
  var SPLIT_MARK = 'わずかに';
  var TOGETHER_MARKS = ['寄っており', '指しており'];

  /* 送る文の言い換え。数(何票か)は送らない=票数まで送ると
     一意に決まる日が6日出る(4節の実測 D の粒度) */
  var TOGETHER_PHRASE = '五つの見方がそろってこの向きを指しています';
  var SPLIT_PHRASE = '五つの見方は二手に分かれていて、そのうちのいくつかがこの向きです';

  /* 中継役へ渡す役どころ(送るもの その2 の system)。
     ここに読み手の情報は1つも入らない */
  var SYSTEM_TEXT = [
    'あなたは占い師です。',
    '日本語で、やわらかい語り口の読み物を書きます。読み手は13歳以上です。',
    '渡された見立てだけを手がかりに書き、それ以外のことを推し量って書き足さないでください。'
  ].join('');

  /* 書き方の決まり(指示文の後半)。**門はこの依頼文ではなく受け取り側に置く**
     (工程4・D8)=ここに書いたから守られる、とは数えない */
  var WRITING_RULES = [
    '・日本語で、300字から400字。地の文だけで書き、見出しや箇条書きを使わない。',
    '・読み手のことは「あなた」と呼ぶ。',
    '・言い切らずに、「〜と読み取れます」「〜のようです」のような結び方にする。',
    '・こわがらせる書き方、占いに寄りかからせる書き方をしない。',
    '・体の具合・法律・お金のことは言い切らない。',
    '・占いの流派の言葉や、前提知識の要る漢字の言葉を使わない。ふだんの言葉で書く。',
    '・上の二つの手がかりを、日々の暮らしの場面へ言い換えて書く。',
    '・生まれた日や名前は渡していないので、それらには触れない。'
  ];

  /** その label がどちらの軸か(知らない label なら null) */
  function axisOfLabel(label) {
    for (var i = 0; i < SEND_AXES.length; i++) {
      if (SEND_AXES[i].label === label) { return SEND_AXES[i]; }
    }
    return null;
  }

  /** note の言い方から「そろっている(true)/二手に分かれている(false)」を見分ける。
   *  どちらの目印も無ければ null(値を作らない) */
  function togetherOf(note) {
    var text = typeof note === 'string' ? note : '';
    if (text.indexOf(SPLIT_MARK) >= 0) { return false; }
    for (var i = 0; i < TOGETHER_MARKS.length; i++) {
      if (text.indexOf(TOGETHER_MARKS[i]) >= 0) { return true; }
    }
    return null;
  }

  /**
   * 総合占いの結果から、中継役へ送る見立て(digest)だけを取り出す。
   * **取り出せるのは2軸ぶんの「型」と「そろっているか」の4つだけ**で、
   * ここを通らなかったものは1文字も送られない。
   *
   * @param {object} overall engine.computeOverall の結果
   * @returns {{ugoki:{value:string,together:boolean}, maai:{value:string,together:boolean}}|null}
   */
  function digestOfOverall(overall) {
    if (!overall || typeof overall !== 'object' || !Array.isArray(overall.items)) { return null; }
    var digest = {};
    for (var i = 0; i < overall.items.length; i++) {
      var item = overall.items[i];
      if (!item || typeof item !== 'object') { continue; }
      var axis = axisOfLabel(item.label);
      if (!axis) { continue; }               /* 知らない欄は見ない */
      if (axis.values.indexOf(item.value) < 0) { return null; }  /* 知らない値は送らない */
      var together = togetherOf(item.note);
      if (together === null) { return null; }                    /* 見分けられないなら送らない */
      digest[axis.key] = { value: item.value, together: together };
    }
    for (var j = 0; j < SEND_AXES.length; j++) {
      if (!digest[SEND_AXES[j].key]) { return null; }            /* 2軸そろわなければ送らない */
    }
    return digest;
  }

  /** 見立てを一つの文字列にする(その起動の間のひかえの鍵に使う) */
  function digestKey(digest) {
    if (!digest) { return ''; }
    var parts = [];
    for (var i = 0; i < SEND_AXES.length; i++) {
      var d = digest[SEND_AXES[i].key];
      parts.push(SEND_AXES[i].key + '=' + d.value + (d.together ? '+そろい' : '+分かれ'));
    }
    return parts.join('|');
  }

  /** 中継役へ送る指示文(messages の content)を組み立てる */
  function buildUserText(digest) {
    if (!digest) { return ''; }
    var lines = ['つぎの見立てをもとに、総合占いの読み物を書いてください。', ''];
    for (var i = 0; i < SEND_AXES.length; i++) {
      var axis = SEND_AXES[i];
      var d = digest[axis.key];
      lines.push('・' + axis.ask + ':' + d.value);
      lines.push('・その寄り方:' + (d.together ? TOGETHER_PHRASE : SPLIT_PHRASE));
    }
    lines.push('');
    lines.push('書き方の決まり');
    for (var j = 0; j < WRITING_RULES.length; j++) { lines.push(WRITING_RULES[j]); }
    return lines.join('\n');
  }

  /** 送る中身(system と messages)。器と制約の判定は ai-relay.js が持つ */
  function buildPayload(digest) {
    return relay.buildPayload(SYSTEM_TEXT, buildUserText(digest));
  }

  /**
   * 中継役が使えないときの戻り先=**いま画面に出ている決定論的な文そのもの**(D4)。
   * 総合占いの二つの節の本文を、画面と同じ並びで連ねる。
   * ここを作り直した文にしてしまうと「戻り先がいまと同じ」が崩れるので、
   * 結果オブジェクトの文をそのまま並べるだけにする。
   */
  function fallbackTextOf(overall) {
    if (!overall || !Array.isArray(overall.sections)) { return ''; }
    var out = [];
    for (var i = 0; i < overall.sections.length; i++) {
      var sec = overall.sections[i];
      var body = (sec && Array.isArray(sec.body)) ? sec.body : [];
      for (var j = 0; j < body.length; j++) { out.push(String(body[j])); }
    }
    return out.join('\n');
  }

  /* その起動の間だけのひかえ(D7)。localStorage へは書かない
     =「保存は利用者が選んだ時だけ」の条項に触れないため。
     **ひかえるのは中継役から返った側だけ**で、戻り先の文はひかえない
     ——同じ見立て(25通り)には日の違う人がまとめて入るので、
     戻り先の文まで持つと**別の日の文**を出してしまう(戻り先は毎回その日の
     結果オブジェクトから作り直す) */
  var cache = {};

  /** ひかえを空にする(検査と、画面を閉じたときのために持つ) */
  function resetCache() { cache = {}; }

  /** いまひかえている見立ての数(検査が「1入力1回」を数えるために持つ) */
  function cacheSize() {
    var n = 0;
    for (var k in cache) { if (Object.prototype.hasOwnProperty.call(cache, k)) { n++; } }
    return n;
  }

  /**
   * 総合占いの読み物を中継役へ頼む。**例外を投げない**(ai-relay.js と同じ約束)。
   *
   * 返す形には **`text` という欄を作らない**。中継役が書いた文は `aiText`、
   * こちらの文は `fallbackText` で返し、どちらを画面へ出すかは
   * **工程4の門を通してから**呼び出し側が決める(門を通していない文が
   * `text` という名で画面へ流れ込む道を、形として塞ぐ)。
   *
   * @param {object} overall engine.computeOverall の結果
   * @param {{transport?:Function, timeoutMs?:number, relay?:object}} [opts]
   */
  function readingFor(overall, opts) {
    var options = opts || {};
    var post = (options.relay && typeof options.relay.request === 'function') ? options.relay : relay;
    var fallbackText = fallbackTextOf(overall);
    var digest = digestOfOverall(overall);

    if (!digest) {
      return Promise.resolve(shape({
        outcome: 'unavailable', usable: false, aiText: '', relayMessage: '',
        reason: '送ってよい見立てを取り出せなかった', sent: false, cached: false
      }, fallbackText, null));
    }

    var key = digestKey(digest);
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      var kept = cache[key];
      return Promise.resolve(shape({
        outcome: kept.outcome, usable: kept.usable, aiText: kept.aiText,
        relayMessage: kept.relayMessage, reason: kept.reason, sent: false, cached: true
      }, fallbackText, digest));
    }

    return post.request(buildPayload(digest), options).then(function (out) {
      var kept = {
        outcome: out.outcome,
        usable: out.usable,
        aiText: out.usable ? out.text : '',
        relayMessage: out.relayMessage,
        reason: out.reason
      };
      /* 失敗した返りもひかえる=同じ見立てで何度も呼び直さない(1入力1回・D7) */
      cache[key] = kept;
      return shape({
        outcome: kept.outcome, usable: kept.usable, aiText: kept.aiText,
        relayMessage: kept.relayMessage, reason: kept.reason,
        sent: out.sent !== false, cached: false
      }, fallbackText, digest);
    });
  }

  /** 返す形を1か所で作る(欄の名を散らかさないため) */
  function shape(base, fallbackText, digest) {
    return {
      outcome: base.outcome,
      usable: base.usable,
      /* 外から来た文(工程4の門を通してから画面へ) */
      aiText: base.aiText,
      relayMessage: base.relayMessage,
      /* こちらの文(門を通さずに画面へ出してよい) */
      fallbackText: fallbackText,
      message: relay.FALLBACK_MESSAGE[base.outcome],
      reason: base.reason,
      sent: base.sent,
      cached: base.cached,
      digest: digest
    };
  }

  return {
    SEND_AXES: SEND_AXES,
    SYSTEM_TEXT: SYSTEM_TEXT,
    WRITING_RULES: WRITING_RULES,
    TOGETHER_PHRASE: TOGETHER_PHRASE,
    SPLIT_PHRASE: SPLIT_PHRASE,
    SPLIT_MARK: SPLIT_MARK,
    TOGETHER_MARKS: TOGETHER_MARKS,
    axisOfLabel: axisOfLabel,
    togetherOf: togetherOf,
    digestOfOverall: digestOfOverall,
    digestKey: digestKey,
    buildUserText: buildUserText,
    buildPayload: buildPayload,
    fallbackTextOf: fallbackTextOf,
    readingFor: readingFor,
    resetCache: resetCache,
    cacheSize: cacheSize
  };
});
