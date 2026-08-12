/* 外部AIの中継役(uranai-relay)への送信部品
 *
 * オーナーコメント #72(2026-08-12)で承認された、ただ1つの外部送信先へ
 * 指示文を送り、返ってきた本文を受け取るだけの部品です。
 * 決めごと・工程表は docs/ai-overall-plan.md の1か所にあります。
 *
 * この部品が守ること
 *   - 送信先は下の RELAY_URL 1つだけ。このファイルの、この1行だけに書く
 *   - APIキーは中継役の中にあり、ここにもリポジトリのどこにも置かない(D2)
 *   - 返りの8通りのどれであっても、呼び出した側が「画面を壊さない」判断を
 *     できる形で返す。この部品自身は例外を投げない(D4)
 *   - 画面へ渡してよいのは text と message だけ。usage / remaining /
 *     stop_reason は受け取っても捨てる(D9・原文「表示に使うのは text だけです」)
 *   - 送信口(transport)を差し替えられる。検査は差し替え口を使い、
 *     実際の通信を1度もしない(D7:1日の上限を食いつぶさないため)
 *
 * この部品は画面へまだつながっていません(工程3・工程4でつなぎます)。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.UranaiAiRelay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 承認された唯一の送信先(オーナーコメント #72 の原文)。
     外部URLをこのファイルの外にも、この行の外にも置かないこと。
     tests/external-url.js が、この1つと完全一致することを毎回見ています */
  var RELAY_URL = 'https://uranai-relay.uranai-relay.workers.dev';

  /* 中継役の制約(原文の写し)と、こちら側で決めた待ち時間の上限 */
  var LIMITS = {
    totalChars: 6000,   // system と messages の合計
    messages: 20,       // messages の最大件数
    roles: ['user', 'assistant'],
    timeoutMs: 20000    // 待ち時間の上限。過ぎたら打ち切って既存の文へ戻す
  };

  /* 中継役が返す error の名(原文の6通り) */
  var ERROR_OUTCOMES = [
    'daily_total_limit_reached',
    'user_daily_limit_reached',
    'too_long',
    'refused',
    'upstream_error',
    'origin_not_allowed'
  ];

  /* アプリ側が実際に出会う形は8通り。上の6つに
     「成功」と「届かない・読めない」を足したもの(docs/ai-overall-plan.md の6節) */
  var OUTCOMES = ['ok'].concat(ERROR_OUTCOMES, ['unavailable']);

  /* 送ってはいけない形(D1)。中継役へ送るのは端末内の計算が出し終えた結果の言葉だけで、
     生年月日そのものは送らない。**これは D1 の本体ではない**=本体は
     「送る値の組から生年月日が一意に決まらないこと」で、その測りは工程3で行う。
     ここに置くのは、いちばん粗い失敗(日付をそのまま指示文へ入れてしまう形)を
     送信口の手前で機械的に止めるための網である(点検役 M3)。
     **名前と性別をこの網に入れていないのは見落としではない**=名前は任意の文字列なので
     機械では見分けられず、性別は「男」「女」の一字が読みの本文に現れうるため、
     広い網を掛けると正しい送信まで黙って止まる。その2つは指示文を組み立てる側(工程3)で
     入れないことを走査で示す */
  var PII_SHAPES = [
    { re: /\d{4}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}/, name: '生年月日らしき並び' },
    { re: /\b(19|20)\d{6}\b/, name: '8桁の日付らしき数' }
  ];

  /* 中継役が返す本文の長さの上限。これを超えたら既存の文へ倒す。
     画面が受け取る文の大きさに歯止めが無いと、返りしだいで画面が壊れうる */
  var MAX_TEXT_CHARS = 4000;

  /* 中継役が message を返さなかったときに、こちらで添える案内。
     **message は常にこの表から出す**(点検役 M4)=外から来た文は relayMessage という
     別の名で返し、画面へ出すなら工程4の門を通すことを呼び出し側に強いる。
     こうしておくと「message は必ずこちらの文」が形として決まり、
     門を text にだけ掛けて message に掛け忘れる落ち方が起きない */
  var FALLBACK_MESSAGE = {
    ok: '',
    daily_total_limit_reached: '今日はここまでの生成となりました。これまでどおりの総合占いをお読みいただけます。',
    user_daily_limit_reached: 'この端末からの今日の生成はここまでです。これまでどおりの総合占いをお読みいただけます。',
    too_long: '送る文が長かったため、これまでどおりの総合占いをお読みいただけます。',
    refused: '今回は文を組み立てられなかったため、これまでどおりの総合占いをお読みいただけます。',
    upstream_error: '中継役が混み合っているようです。これまでどおりの総合占いをお読みいただけます。',
    origin_not_allowed: 'いまの場所からは呼び出せないため、これまでどおりの総合占いをお読みいただけます。',
    unavailable: 'うまくつながらなかったため、これまでどおりの総合占いをお読みいただけます。'
  };

  /** 送信先(1か所の定数を読むだけ。呼び出し側にURLを書かせないため) */
  function relayUrl() { return RELAY_URL; }

  /** その返りでAI生成の文を使ってよいか。ok 以外はすべて既存の文へ戻す(D4) */
  function isUsable(outcome) { return outcome === 'ok'; }

  /**
   * 指示文から送る中身を組み立てる(送るもの その2 の形)。
   * 何を指示文に入れてよいかは工程3(D1)で決める。ここは器だけを持つ。
   */
  function buildPayload(system, userText) {
    /* 文字列でないものを黙って String() へ通さない(点検役 L6)。
       結果オブジェクトを取り違えて渡すと "[object Object]" が静かに送られてしまう。
       ここでは形をそのまま残し、payloadProblems に「文字列であること」を拾わせる */
    return {
      system: system == null ? '' : system,
      messages: [{ role: 'user', content: userText == null ? '' : userText }]
    };
  }

  /** 送る中身が制約を満たしているか。満たさない点を日本語で並べて返す(空なら問題なし) */
  function payloadProblems(payload) {
    var problems = [];
    if (!payload || typeof payload !== 'object') { return ['送る中身がありません']; }

    var system = typeof payload.system === 'string' ? payload.system : '';
    if (payload.system != null && typeof payload.system !== 'string') {
      problems.push('system は文字列であること');
    }

    var messages = payload.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      problems.push('messages が1件以上の配列であること');
      messages = [];
    }
    if (messages.length > LIMITS.messages) {
      problems.push('messages は' + LIMITS.messages + '件まで(いま' + messages.length + '件)');
    }

    var total = system.length;
    var texts = [system];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (!m || typeof m !== 'object') { problems.push((i + 1) + '件目が空です'); continue; }
      if (LIMITS.roles.indexOf(m.role) < 0) {
        problems.push((i + 1) + '件目の role は ' + LIMITS.roles.join(' か ') + ' のどちらか(いま ' + m.role + ')');
      }
      if (typeof m.content !== 'string') {
        problems.push((i + 1) + '件目の content は文字列であること');
        continue;
      }
      total += m.content.length;
      texts.push(m.content);
    }
    if (total > LIMITS.totalChars) {
      problems.push('system と messages の合計は' + LIMITS.totalChars + '文字まで(いま' + total + '文字)');
    }

    /* 生年月日らしき並びが混じっていたら送らない(D1・点検役 M3) */
    var joined = texts.join('\n');
    for (var j = 0; j < PII_SHAPES.length; j++) {
      if (PII_SHAPES[j].re.test(joined)) {
        problems.push('送ってよいのは計算が出し終えた結果の言葉だけ(' + PII_SHAPES[j].name + 'が混じっています)');
      }
    }
    return problems;
  }

  /** system と messages の合計文字数(工程3で上限に収めるために使う) */
  function payloadLength(payload) {
    if (!payload || typeof payload !== 'object') { return 0; }
    var total = typeof payload.system === 'string' ? payload.system.length : 0;
    var messages = Array.isArray(payload.messages) ? payload.messages : [];
    for (var i = 0; i < messages.length; i++) {
      if (messages[i] && typeof messages[i].content === 'string') { total += messages[i].content.length; }
    }
    return total;
  }

  /**
   * 返りを8通りのどれかへ仕分ける。通信を伴わない純粋な判定なので、
   * 8通りすべてを机上の見本で通せる(検査 AI2-3)。
   *
   * @param {{status?:number, body?:any, failed?:boolean, timedOut?:boolean}} reply
   * @returns {{outcome:string, usable:boolean, text:string, message:string,
   *            messageFromRelay:boolean, reason:string}}
   */
  function classify(reply) {
    var r = reply || {};

    if (r.timedOut) { return result('unavailable', '', null, '待ち時間の上限を過ぎた'); }
    if (r.failed) { return result('unavailable', '', null, '中継役へ届かなかった'); }

    var body = r.body;
    if (!body || typeof body !== 'object') {
      return result('unavailable', '', null, '返りを読み取れなかった');
    }

    /* error が入っていれば、**その形が何であれ**失敗として仕分ける(点検役 M1)。
       名が分かるときはその名で、分からないときは unavailable へ落とす。
       「typeof が文字列のときだけ」で見ると、error が数値や物で返ったときに
       この枝を素通りし、text があれば成功として画面へ出てしまう
       ——「番号だけが食い違って返っても画面が壊れない側へ倒す」の逆になる */
    if (body.error != null && body.error !== '' && body.error !== false) {
      var name = typeof body.error === 'string' ? body.error : '';
      if (ERROR_OUTCOMES.indexOf(name) >= 0) {
        return result(name, '', body.message, '中継役が ' + name + ' を返した');
      }
      return result('unavailable', '', body.message, '知らない error(' + String(body.error) + ')');
    }

    if (typeof body.text !== 'string' || body.text.trim() === '') {
      return result('unavailable', '', body.message, '本文が空だった');
    }
    /* 長すぎる本文も既存の文へ倒す。戻り先があるので画面は壊れない(点検役 M5) */
    if (body.text.length > MAX_TEXT_CHARS) {
      return result('unavailable', '', body.message,
        '本文が長すぎた(' + body.text.length + '文字・上限' + MAX_TEXT_CHARS + '文字)');
    }

    /* 成功。usage / remaining / stop_reason はここで捨てる(D9) */
    return result('ok', body.text, null, '中継役が本文を返した');
  }

  /**
   * 仕分けの結果をひとまとめにする。
   * **`message` は常にこちらの文**で、中継役が返した文は `relayMessage` に分けて置く(点検役 M4)。
   * こうすると工程4の門は `text` と `relayMessage` の2つだけを通せばよく、
   * 「`message` は必ず安全」が形として決まる(門を text にだけ掛ける落ち方が起きない)。
   */
  function result(outcome, text, relayMessage, reason) {
    var fromRelay = typeof relayMessage === 'string' && relayMessage.trim() !== '';
    return {
      outcome: outcome,
      usable: isUsable(outcome),
      /* 画面へ出す前に工程4の門を通すもの(外から来た文) */
      text: outcome === 'ok' ? String(text) : '',
      relayMessage: fromRelay ? String(relayMessage) : '',
      /* 門を通さずに画面へ出してよいもの(こちらが書いた文) */
      message: FALLBACK_MESSAGE[outcome],
      reason: reason
    };
  }

  /** 既定の送信口。ブラウザの fetch を使う。検査ではここを通さない(D7) */
  function defaultTransport(url, init) {
    return fetch(RELAY_URL, init).then(function (res) {
      return res.json().then(
        function (body) { return { status: res.status, body: body }; },
        function () { return { status: res.status, body: null }; }
      );
    });
  }

  /**
   * 中継役へ送り、8通りのどれかへ仕分けた結果を返す。
   * この関数は例外を投げない(どの失敗も outcome として返る)。
   *
   * @param {object} payload buildPayload が作った中身
   * @param {{transport?:Function, timeoutMs?:number}} [opts] 送信口の差し替え(検査で使う)
   */
  function request(payload, opts) {
    var options = opts || {};
    var transport = typeof options.transport === 'function' ? options.transport : defaultTransport;
    /* 0 や負の値を上限として受け取らない(受け取ると必ず即打ち切りになる。点検役 L6) */
    var timeoutMs = (typeof options.timeoutMs === 'number' && options.timeoutMs > 0)
      ? options.timeoutMs : LIMITS.timeoutMs;

    /* 送る前に制約を確かめる。外れていれば送らない
       (中継役の1日の上限を、こちらの作り損ないで食わないため)。
       **長さで外れたときだけ too_long と名乗る**=それ以外(role が違う・件数が多い等)を
       too_long と呼ぶと、あとで記録を読む者が中継役の返した too_long と取り違える */
    var problems = payloadProblems(payload);
    if (problems.length > 0) {
      var byLength = payloadLength(payload) > LIMITS.totalChars;
      var stopped = result(byLength ? 'too_long' : 'unavailable', '', null,
        '送る前に制約に外れた: ' + problems.join(' / '));
      stopped.sent = false;
      return Promise.resolve(stopped);
    }

    return new Promise(function (resolve) {
      var done = false;
      /* 打ち切るときは通信そのものも取り消す(点検役 M5)。
         取り消さないと、こちらが諦めたあとも中継役側の呼び出しは成立し続け、
         利用者が読み直すたびに「1人あたり1日5回」を二重に食う */
      var controller = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (done) { return; }
        done = true;
        if (controller) { try { controller.abort(); } catch (e) { /* 取り消せなくても倒れ先は同じ */ } }
        var out = classify({ timedOut: true });
        out.sent = true;
        resolve(out);
      }, timeoutMs);

      var finish = function (reply) {
        if (done) { return; }
        done = true;
        clearTimeout(timer);
        var out = classify(reply);
        out.sent = true;
        resolve(out);
      };

      var init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
      if (controller) { init.signal = controller.signal; }

      var sending;
      try {
        sending = transport(RELAY_URL, init);
      } catch (e) {
        finish({ failed: true });
        return;
      }

      Promise.resolve(sending).then(
        function (reply) { finish(reply || { failed: true }); },
        function () { finish({ failed: true }); }
      );
    });
  }

  return {
    RELAY_URL: RELAY_URL,
    relayUrl: relayUrl,
    LIMITS: LIMITS,
    MAX_TEXT_CHARS: MAX_TEXT_CHARS,
    defaultTransport: defaultTransport,
    OUTCOMES: OUTCOMES,
    ERROR_OUTCOMES: ERROR_OUTCOMES,
    FALLBACK_MESSAGE: FALLBACK_MESSAGE,
    isUsable: isUsable,
    buildPayload: buildPayload,
    payloadProblems: payloadProblems,
    payloadLength: payloadLength,
    classify: classify,
    request: request
  };
});
