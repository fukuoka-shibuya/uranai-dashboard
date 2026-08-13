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
 *     どちらを画面へ出すかは**この部品の門(`screenTextOf`)を通してから**決めさせる
 *   - 画面へ出す文と、待っている間・断りの一言は**すべてこの部品が持つ**
 *     (app/index.html に文章を書かない=文言の検査をエンジン側に集めるため)
 *
 * 工程4(cycle-0124)で画面へつないだ。画面側が呼ぶのは `readingFor` と
 * `screenTextOf` の2つだけで、`aiText` を直に読む道は画面側に無い。
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

  /* ===== 受け取り側の門(D8・工程4) =====================================
     中継役の先(外部モデル)は当方の管理外なので、返り文字列は**信頼できない入力**として
     扱う。指示文の側で「使わないでください」と書いても守られる保証は無いので、
     **画面へ出す直前にこちら側で当てる**(D8)。

     ここに置く一覧は `tests/banned-words.js` の `BANNED` と `JARGON_SCREEN` と
     **同じもの**である。テストのファイルは公開されずブラウザからも読めないため、
     アプリ側にも同じ表を持つほかない(仮計算と正式計算の表を分けて持つのと同じ形)。
     **二重管理が黙って食い違うことは tests/ai-screen.spec.js の AI4-1 が
     両側の正規表現を1本ずつ突き合わせて塞ぐ**(片方に語を足すと必ず落ちる)。 */

  /* 門の一覧ここから
     この下の2つの表は**禁止語そのものを持つのが役目**なので、
     tests/engine.spec.js の「エンジンの文章に禁止表現が含まれない」走査から外す。
     外れるのは印にはさまれたこの区画だけで、同じファイルの他はすべて走査される。
     区画が実在すること・区画に表以外のものを置いていないことは同じ検査が見る */
  var BANNED = [
    /* 断定・的中 */
    /必ず/, /絶対/, /運命(が|は).{0,4}決ま/, /的中/, /間違い(なく|ありません)/,
    /当た(る|り)ま/, /外れ(ない|ません)/, /確実に/, /断言/,
    /* 恐怖 */
    /死ぬ|死に/, /呪/, /祟/, /不幸/, /災い/, /大凶|凶運|凶相/, /地獄/, /罰が/,
    /* 依存誘発 */
    /(毎日|欠かさず).{0,8}(見て|読んで|確かめて|確認して)/, /ここでしか/, /あなただけに/, /(見|読ま)ないと/,
    /* 医療・法律・投資の断定 */
    /(治り|治る|治し)ま/, /効きます/, /病気が(良く|悪く)なり/,
    /勝てます/, /訴え(れば|たら|るべき)/,
    /儲かり|利益が出ま|値上がりしま|買うべき|売るべき/
  ];

  var JARGON_SCREEN = [
    { re: /安住|和善|急速|軽燥|毒害|猛悪|剛柔/, name: '七科分宿の呼び名' },
    { re: /柱/, name: '柱' },
    { re: /区分/, name: '区分' },
    { re: /組(?![みむん])/, name: '組(組み合わせ・組む を除く)' },
    { re: /系統/, name: '系統' },
    { re: /盤/, name: '盤' },
    { re: /定位/, name: '定位' },
    { re: /黄道/, name: '黄道' },
    { re: /五行/, name: '五行' },
    { re: /十干|十二支|十大主星/, name: '十干・十二支・十大主星' },
    { re: /エレメント/, name: 'エレメント' },
    { re: /グループ/, name: 'グループ' },
    { re: /のしるし/, name: 'しるし' }
  ];

  /* 禁止表現の**かな書き**(工程6・cycle-0127)。
     上の `BANNED` は漢字の形しか持たないため、中継役の先のモデルが
     「かならず」「ぜったい」とかなで書いた文が**そのまま画面へ出ていた**
     (実測=13通りの見本のうち11通りが門を素通りした)。
     これは攻撃を想定した話ではなく、**日本語をかなで書くのはごく普通のこと**
     なので、起こりにくい抜け道ではない。

     一覧は上の `BANNED` の**漢字の語から読みを起こしたもの**で、
     取りこぼしは tests/ai-screen.spec.js の GATE6-2 が
     「`BANNED` の各行に読みの行があるか、無いなら理由が書いてあるか」で見る。

     **かなにしない語がある**=かなで書くと別の意味になってしまう語は入れない。
     「のろい」(呪い/鈍い)・「かくじつ」(確実)のように、
     ふつうの文で使われる語を止めると**中継役の文が理由もなく捨てられる**ためで、
     このときは語を絞った形(「のろわれ」)にするか、読みを置かない。

     **`JARGON_SCREEN`(画面に出さない語)にはかな書きを足していない。**
     これは足し忘れではなく決めたことである=あちらの読みは
     「はしら」「くみ」「けいとう」「ばん」「ていい」のように
     **ふつうの日本語の語と同じ形**になるものが多く、一律にかなを止めると
     中継役の文がまともな理由なく捨てられる。あちらは断定・恐怖ではなく
     **言葉づかいの揃え**が目的(#51)なので、取りこぼしても読み手が傷つく形にはならない。
     したがって `JARGON_SCREEN` はならした文に当てるところまでとし、
     かな書きの取りこぼしは**残っている**(実測=「はしら」「ごぎょう」は素通りする)。
     この限りは台帳 GATE-L1 に残す。 */
  var BANNED_KANA = [
    /* 断定・的中 */
    /かならず/, /カナラズ/, /ぜったい/, /ゼッタイ/,
    /* かなと漢字は混ざる(「うんめいは決まって」)ので、受けは両方を見る */
    /うんめい(が|は).{0,4}(決ま|きま)/, /てきちゅう/,
    /* 恐怖 */
    /のろわれ/, /たたり|たたられ/, /ふこう(に|な|が|を)/, /わざわい/, /じごく/,
    /* 依存誘発 */
    /ここでしか/, /あなただけに/
  ];
  /* 門の一覧ここまで */

  /* 中継役の返りが空でないのに門で止まったとき、なぜ止めたかを画面に出さない
     ——止めた語をそのまま出せば、禁じた語が画面に出てしまう。理由は返り値の
     `blocked`(語の呼び名だけ)に残し、画面へは出さない */
  /* 門に当てる前に文をならす(工程6・cycle-0127)。
     語の途中に1文字はさむだけで門を素通りできたため
     (「必 ず」「必\nず」「必・ず」「必<ゼロ幅空白>ず」の4通りを実測)、
     **字と字の間に入りうるもの**を落としてから当てる。落とすのは
     空白(半角・全角・タブ・改行)・ゼロ幅と制御文字・中点と読点まわりの区切り記号だけで、
     **文字そのものは足しも減らしもしない**。
     NFKC は全角と半角の書き分け(「必ず」)をそろえるために先に通す。

     ならした文は**門に当てるためだけ**に使い、画面へ出すのは元の文である
     (こちらで文を書き替えて出すと、中継役が書いた文とは別のものになる)。
     ならす前とならした後の**両方**に当てて、どちらかが当たれば止める
     =ならす操作で当たらなくなる形があっても取りこぼさないため(安全側)。 */
  function normalizeForGate(text) {
    var body = String(text);
    if (typeof body.normalize === 'function') { body = body.normalize('NFKC'); }
    /* 空白・ゼロ幅・制御文字・字間に挟まりやすい区切り記号を落とす。
       **目に見えない文字は番号で書く**=見た目では確かめられないため */
    return body
      .replace(/[\s\u3000]/g, '')                          /* 空白・改行・全角空白 */
      .replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '')  /* ゼロ幅・語結合子・書字方向 */
      .replace(/[\u0000-\u001f\u007f]/g, '')               /* 制御文字 */
      .replace(/[\u30fb\uff65\u00b7\u2027.,\-_~*]/g, '');  /* 中点・区切り記号 */
  }

  function screenProblems(text) {
    var body = typeof text === 'string' ? text : '';
    var problems = [];
    var i;
    if (body.trim() === '') { return ['文が空']; }
    var flat = normalizeForGate(body);
    for (i = 0; i < BANNED.length; i++) {
      if (BANNED[i].test(body) || BANNED[i].test(flat)) {
        problems.push('禁止表現(' + BANNED[i].source + ')');
      }
    }
    for (i = 0; i < BANNED_KANA.length; i++) {
      if (BANNED_KANA[i].test(body) || BANNED_KANA[i].test(flat)) {
        problems.push('禁止表現のかな書き(' + BANNED_KANA[i].source + ')');
      }
    }
    for (i = 0; i < JARGON_SCREEN.length; i++) {
      if (JARGON_SCREEN[i].re.test(body) || JARGON_SCREEN[i].re.test(flat)) {
        problems.push('画面に出さない語(' + JARGON_SCREEN[i].name + ')');
      }
    }
    return problems;
  }

  /** 門を通るか(通れば true)。空文字は通さない */
  function passesGate(text) { return screenProblems(text).length === 0; }

  /* 画面に出す、こちらが書いた文(app/index.html には文章を置かない)。
     **中継役が返した `relayMessage` は画面へ出さない**=ご指示は「message の日本語を
     そのまま案内文に使ってよい」と述べているが「使え」とは述べておらず、
     こちらの表(ai-relay.js の FALLBACK_MESSAGE)で同じ用が足りる。
     外から来た文を1つでも減らすほうが安全側なので出さない側を選んだ。
     出していないことは AI4-6 が偽の返りで毎回確かめる */
  var UI_TEXT = {
    /* 待っている間。決定論的な文はすでに下に出ているので、隠れるものは無い */
    waiting: '読み物を書き起こしています。少しお待ちください。',
    /* AI生成の文が出たときの見出しと、毎回変わりうることの断り(D3・M6) */
    aiHeading: '今日の読み物',
    aiNotice: 'この読み物はお読みになるたびに書き起こされるため、同じ生年月日でも文章が変わることがあります。下の一覧に出る占いの結果そのものは変わりません。',
    /* 門で止めたときの案内。止めた語そのものは出さない */
    blocked: '書き起こした文が当アプリの決まりに合わなかったため、これまでどおりの総合占いをお読みいただけます。'
  };

  /**
   * 画面へ出す文を1か所で決める(D8 の門はここを通る)。
   *
   * - `aiText` が門を通ったときだけ `source:'ai'` を返す
   * - それ以外は必ず `source:'fallback'`(=いま画面に出ている決定論的な文)
   * - `body` は**必ず文字列**で、空にならない(戻り先が空のときだけ空になりうるが、
   *   その場合は呼び出し側がすでに描いた本文をそのまま残せばよい)
   *
   * @param {object} reading readingFor の返り
   * @returns {{source:'ai'|'fallback', body:string, notice:string, message:string, blocked:string[]}}
   */
  function screenTextOf(reading) {
    var r = reading || {};
    var fallbackText = typeof r.fallbackText === 'string' ? r.fallbackText : '';
    var message = typeof r.message === 'string' ? r.message : '';

    if (!r.usable) {
      return { source: 'fallback', body: fallbackText, notice: '', message: message, blocked: [] };
    }
    var problems = screenProblems(r.aiText);
    if (problems.length > 0) {
      return {
        source: 'fallback', body: fallbackText, notice: '',
        message: UI_TEXT.blocked, blocked: problems
      };
    }
    return {
      source: 'ai', body: String(r.aiText), notice: UI_TEXT.aiNotice, message: '', blocked: []
    };
  }

  /* その起動の間だけのひかえ(D7)。localStorage へは書かない
     =「保存は利用者が選んだ時だけ」の条項に触れないため。
     **中身は「中継役へ頼んでいる約束(Promise)」**で、返った値ではない
     (cycle-0129・台帳 AI6-M2。返る前の2度目もこの1つに相乗りさせるため)。
     **ひかえるのは中継役から返った側だけ**で、戻り先の文はひかえない
     ——同じ見立て(25通り)には日の違う人がまとめて入るので、
     戻り先の文まで持つと**別の日の文**を出してしまう(戻り先は毎回その日の
     結果オブジェクトから作り直す) */
  var cache = {};

  /** ひかえを空にする。**呼んでいるのは検査だけ**(画面側は1度も呼ばない)。
      画面から呼ぶ側へ倒さないこと=進行中の約束を捨てると、次の同じ見立てが
      1回余計に送ることになり、1人1日5回の上限の観点では逆へ働く */
  function resetCache() { cache = {}; }

  /** いまひかえている見立ての数(検査が「1入力1回」を数えるために持つ)。
      **進行中の約束も1件として数える**(cycle-0129 以降。ひかえへ入れるのが
      返ってからではなく送った直後になったため) */
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
      /* **ひかえているのは「返り」ではなく「進行中の約束そのもの」**
         (cycle-0129・台帳 AI6-M2)。返った値だけをひかえる作りだと、
         **返る前**にもう一度呼ばれた2度目はひかえに当たらずそのまま送ってしまい、
         1人1日5回の上限をその分だけ早く食う(待ちの上限は20秒あるので、
         その間に開き直せば起きる)。約束をひかえておけば、返る前の2度目は
         **同じ1回に相乗りして**同じ返りを受け取る。
         鍵は見立てだけなので、**相乗りする側は先に頼んだ側の送信口・待ちの上限に乗る**
         (2度目に別の `opts` を渡しても効かない)。画面から呼ぶのは `opts` 無しの
         1か所だけなので実害は無いが、検査を書くときは踏みやすい。 */
      return cache[key].then(function (kept) {
        return shape({
          outcome: kept.outcome, usable: kept.usable, aiText: kept.aiText,
          relayMessage: kept.relayMessage, reason: kept.reason, sent: false, cached: true
        }, fallbackText, digest);
      });
    }

    /* 失敗した返りもひかえる=同じ見立てで何度も呼び直さない(1入力1回・D7) */
    var pending = post.request(buildPayload(digest), options).then(function (out) {
      return {
        outcome: out.outcome,
        usable: out.usable,
        aiText: out.usable ? out.text : '',
        relayMessage: out.relayMessage,
        reason: out.reason,
        sent: out.sent !== false
      };
    }, function () {
      /* **ここで投げない**=この関数は例外を投げない約束(上の説明)。
         `relay.request` も投げない作りだが、送信口ごと差し替えられた場合など
         **約束の外側から壊れることはある**。そのときも投げずに「使えなかった」側へ倒す。
         **ひかえが約束そのものになった以上、投げると相乗りしている2度目以降も
         まとめて巻き添えになる**(壊れ方が1人ぶんでは済まない)ので、
         受け止める位置はここ以外にない。
         `sent` は **true** にする=中継役へ渡したあとのどこで壊れたのか分からない以上、
         「送っていない」と名乗るのは言い過ぎで、1日の上限を数える側では
         **送ったかもしれない側へ倒すほうが安全**だからである(#45)。 */
      return {
        outcome: 'unavailable', usable: false, aiText: '', relayMessage: '',
        reason: '中継役へ頼む途中で処理そのものが壊れた', sent: true
      };
    });
    /* ひかえへ入れるのは**送った直後・返る前**。この1行が then の中にあると
       上の相乗りが効かない(それが AI6-M2 の形だった)。
       壊れた返りもひかえたままにする=「失敗した返りもひかえる」(D7)と同じ扱いで、
       同じ見立てで何度も呼び直さない */
    cache[key] = pending;

    return pending.then(function (kept) {
      return shape({
        outcome: kept.outcome, usable: kept.usable, aiText: kept.aiText,
        relayMessage: kept.relayMessage, reason: kept.reason,
        sent: kept.sent, cached: false
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
    BANNED: BANNED,
    BANNED_KANA: BANNED_KANA,
    JARGON_SCREEN: JARGON_SCREEN,
    normalizeForGate: normalizeForGate,
    UI_TEXT: UI_TEXT,
    screenProblems: screenProblems,
    passesGate: passesGate,
    screenTextOf: screenTextOf,
    readingFor: readingFor,
    resetCache: resetCache,
    cacheSize: cacheSize
  };
});
