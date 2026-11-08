## Motor das Pedras do Choshen: porte linha a linha de packages/shared/src/puzzle/engine.ts
## (e de rng.ts). Puro e determinístico: a mesma semente e as mesmas jogadas dão o mesmo
## tabuleiro, a mesma pontuação e o mesmo resultado que no servidor, que refaz a partida a
## partir das jogadas para dar estrelas e moedas. tests/test_puzzle.gd confere isso jogada
## por jogada contra partidas de referência geradas pelo TypeScript.
##
## Pedra: {id, kind (0..5; -1 = Urim), special ("" | "row" | "col" | "bomb" | "urim")}.
## Estado: {level, board, clay, rng, nextId, score, movesLeft, movesUsed, collected, status}.
class_name PuzzleEngine

const STONE_KINDS := 6
const SCORE_PER_TILE := 10
const SCORE_PER_BLAST := 20
const SCORE_PER_CLAY := 25
const SCORE_PER_MOVE_LEFT := 50


# --- Sorteio (mulberry32 com aritmética de 32 bits, como no JavaScript) -----------------


static func _u32(x: int) -> int:
	return x & 0xFFFFFFFF


static func _i32(x: int) -> int:
	var u := x & 0xFFFFFFFF
	return u - 0x100000000 if u >= 0x80000000 else u


## Math.imul: os 32 bits de baixo do produto, sem estourar o inteiro de 64 bits.
static func _imul(a: int, b: int) -> int:
	var ua := _u32(a)
	var ub := _u32(b)
	var al := ua & 0xFFFF
	var ah := ua >> 16
	var bl := ub & 0xFFFF
	var bh := ub >> 16
	return _i32(al * bl + (((ah * bl + al * bh) & 0xFFFF) << 16))


## Próximo número de 32 bits sem sinal; rng = {"s": estado}.
static func next_u32(rng: Dictionary) -> int:
	rng.s = _i32(int(rng.s) + 0x6d2b79f5)
	var t: int = rng.s
	t = _imul(t ^ (_u32(t) >> 15), t | 1)
	t = _i32(t ^ (t + _imul(t ^ (_u32(t) >> 7), t | 61)))
	return _u32(t ^ (_u32(t) >> 14))


static func next_int(rng: Dictionary, n: int) -> int:
	return next_u32(rng) % n


# --- Utilidades -------------------------------------------------------------------------


static func _copy(b: Array) -> Array:
	var out: Array = []
	for row in b:
		out.append((row as Array).duplicate())
	return out


static func _key(r: int, c: int) -> int:
	return r * 32 + c


static func _row(k: int) -> int:
	return k / 32


static func _col(k: int) -> int:
	return k % 32


static func _at(board: Array, r: int, c: int) -> Variant:
	if r < 0 or r >= board.size():
		return null
	var row: Array = board[r]
	if c < 0 or c >= row.size():
		return null
	return row[c]


static func _kind_at(board: Array, r: int, c: int) -> Variant:
	var t: Variant = _at(board, r, c)
	return null if t == null else int(t.kind)


static func _matchable(t: Variant) -> bool:
	return t != null and int(t.kind) >= 0


static func _tile(id: int, kind: int, special := "") -> Dictionary:
	return {"id": id, "kind": kind, "special": special}


## Cor nova sem formar trinca com as duas pedras à esquerda ou acima (só na montagem).
static func _pick_kind(board: Array, r: int, c: int, kinds: int, rng: Dictionary) -> int:
	for _tries in 12:
		var k := next_int(rng, kinds)
		if not _forms_line(board, r, c, k):
			return k
	for k in kinds:
		if not _forms_line(board, r, c, k):
			return k
	return 0


static func _forms_line(board: Array, r: int, c: int, k: int) -> bool:
	var left: bool = c >= 2 and _kind_at(board, r, c - 1) == k and _kind_at(board, r, c - 2) == k
	var up: bool = r >= 2 and _kind_at(board, r - 1, c) == k and _kind_at(board, r - 2, c) == k
	return left or up


# --- Combinações -------------------------------------------------------------------------


## Trincas (ou mais) em linha e em coluna: [{cells, dir, kind}].
static func find_runs(board: Array) -> Array:
	var runs: Array = []
	var rows := board.size()
	var cols: int = (board[0] as Array).size() if rows > 0 else 0
	for r in rows:
		var c := 0
		while c < cols:
			var t: Variant = board[r][c]
			var end := c + 1
			if _matchable(t):
				while end < cols and _kind_at(board, r, end) == int(t.kind):
					end += 1
			if _matchable(t) and end - c >= 3:
				var cells: Array = []
				for x in range(c, end):
					cells.append(_key(r, x))
				runs.append({"cells": cells, "dir": "h", "kind": int(t.kind)})
			c = end
	for c in cols:
		var r := 0
		while r < rows:
			var t: Variant = board[r][c]
			var end := r + 1
			if _matchable(t):
				while end < rows and _kind_at(board, end, c) == int(t.kind):
					end += 1
			if _matchable(t) and end - r >= 3:
				var cells: Array = []
				for y in range(r, end):
					cells.append(_key(y, c))
				runs.append({"cells": cells, "dir": "v", "kind": int(t.kind)})
			r = end
	return runs


## Junta trincas que dividem uma casa (L, T, cruz): [{cells (ordenado por inserção), runs, kind}].
static func _group_runs(runs: Array) -> Array:
	var parent: Array = range(runs.size())
	var find := func(i: int, self_ref: Callable) -> int:
		if parent[i] == i:
			return i
		parent[i] = self_ref.call(parent[i], self_ref)
		return parent[i]
	var owner := {}
	for i in runs.size():
		for cell in runs[i].cells:
			if not owner.has(cell):
				owner[cell] = i
			else:
				parent[find.call(i, find)] = find.call(owner[cell], find)
	var groups := {}
	for i in runs.size():
		var root: int = find.call(i, find)
		if not groups.has(root):
			groups[root] = {"cells": {}, "runs": [], "kind": int(runs[i].kind)}
		var g: Dictionary = groups[root]
		for cell in runs[i].cells:
			g.cells[cell] = true
		(g.runs as Array).append(runs[i])
	var out: Array = groups.values()
	out.sort_custom(func(a, b): return (a.cells.keys() as Array).min() < (b.cells.keys() as Array).min())
	return out


## Que especial o grupo forma e onde nasce: {cell, special} ou {}.
static func _special_for(group: Dictionary, board: Array, prefer: Array) -> Dictionary:
	var runs: Array = group.runs
	var longest: Dictionary = runs[0]
	for r in runs:
		if (r.cells as Array).size() > (longest.cells as Array).size():
			longest = r
	var has_h := runs.any(func(r): return r.dir == "h")
	var has_v := runs.any(func(r): return r.dir == "v")
	var n := (longest.cells as Array).size()
	var special := ""
	if n >= 5:
		special = "urim"
	elif has_h and has_v:
		special = "bomb"
	elif n == 4:
		special = "row" if longest.dir == "h" else "col"
	if special == "":
		return {}
	var free := func(cell: int) -> bool:
		var t: Variant = board[_row(cell)][_col(cell)]
		return t == null or str(t.special) == ""
	for cell in prefer:
		if group.cells.has(cell) and free.call(cell):
			return {"cell": cell, "special": special}
	if special == "bomb":
		var counts := {}
		for r in runs:
			for c in r.cells:
				counts[c] = int(counts.get(c, 0)) + 1
		var crosses: Array = []
		for c in counts:
			if counts[c] > 1 and free.call(c):
				crosses.append(c)
		crosses.sort()
		if not crosses.is_empty():
			return {"cell": crosses[0], "special": special}
	var mid: int = longest.cells[floori(float(n - 1) / 2.0)]
	if free.call(mid):
		return {"cell": mid, "special": special}
	var all: Array = group.cells.keys()
	all.sort()
	for c in all:
		if free.call(c):
			return {"cell": c, "special": special}
	return {}


## Casas atingidas por um especial que explode em (r, c).
static func _blast_area(board: Array, r: int, c: int, special: String) -> Array:
	var rows := board.size()
	var cols := (board[0] as Array).size()
	var out: Array = []
	if special == "row":
		for x in cols:
			out.append(_key(r, x))
	if special == "col":
		for y in rows:
			out.append(_key(y, c))
	if special == "bomb":
		for y in range(r - 1, r + 2):
			for x in range(c - 1, c + 2):
				if y >= 0 and y < rows and x >= 0 and x < cols:
					out.append(_key(y, x))
	if special == "urim":
		# Urim atingido por outra explosão: limpa a cor mais comum do tabuleiro.
		var kind := _commonest_kind(board)
		for y in rows:
			for x in cols:
				if _kind_at(board, y, x) == kind:
					out.append(_key(y, x))
		out.append(_key(r, c))
	return out


static func _commonest_kind(board: Array) -> int:
	var counts: Array = []
	counts.resize(STONE_KINDS)
	counts.fill(0)
	for row in board:
		for t in row:
			if _matchable(t):
				counts[int(t.kind)] += 1
	var best := 0
	for k in range(1, counts.size()):
		if counts[k] > counts[best]:
			best = k
	return best


# --- Jogadas possíveis -------------------------------------------------------------------


static func _line_at(board: Array, r: int, c: int) -> bool:
	var t: Variant = _at(board, r, c)
	if not _matchable(t):
		return false
	var k := int(t.kind)
	var h := 1
	var x := c - 1
	while _kind_at(board, r, x) == k:
		h += 1
		x -= 1
	x = c + 1
	while _kind_at(board, r, x) == k:
		h += 1
		x += 1
	if h >= 3:
		return true
	var v := 1
	var y := r - 1
	while _kind_at(board, y, c) == k:
		v += 1
		y -= 1
	y = r + 1
	while _kind_at(board, y, c) == k:
		v += 1
		y += 1
	return v >= 3


static func swap_valid(board: Array, r1: int, c1: int, r2: int, c2: int) -> bool:
	var a: Variant = _at(board, r1, c1)
	var b: Variant = _at(board, r2, c2)
	if a == null or b == null:
		return false
	if a.special == "urim" or b.special == "urim":
		return true
	if a.special != "" and b.special != "":
		return true
	var m := _copy(board)
	m[r1][c1] = b
	m[r2][c2] = a
	return _line_at(m, r1, c1) or _line_at(m, r2, c2)


## Uma jogada que vale (para a dica), ou [] se o tabuleiro travou.
static func find_move(board: Array) -> Array:
	var rows := board.size()
	var cols: int = (board[0] as Array).size() if rows > 0 else 0
	for r in rows:
		for c in cols:
			if c + 1 < cols and swap_valid(board, r, c, r, c + 1):
				return [r, c, r, c + 1]
			if r + 1 < rows and swap_valid(board, r, c, r + 1, c):
				return [r, c, r + 1, c]
	return []


# --- Montagem -------------------------------------------------------------------------


static func create(level: Dictionary, seed: int) -> Dictionary:
	var rng := {"s": _i32(seed)}
	var next_id := 1
	var board: Array = []
	for _attempt in 100:
		board = []
		for r in int(level.rows):
			var row: Array = []
			row.resize(int(level.cols))
			board.append(row)
		for r in int(level.rows):
			for c in int(level.cols):
				var id := next_id
				next_id += 1
				board[r][c] = _tile(id, _pick_kind(board, r, c, int(level.kinds), rng))
		if not find_move(board).is_empty():
			break
	var clay: Array = []
	for row in level.clay:
		var cr: Array = []
		for hp in row:
			cr.append(int(hp))
		clay.append(cr)
	var collected: Array = []
	collected.resize(STONE_KINDS)
	collected.fill(0)
	return {"level": level, "board": board, "clay": clay, "rng": rng.s, "nextId": next_id, "score": 0, "movesLeft": int(level.moves), "movesUsed": 0, "collected": collected, "status": "playing"}


# --- Objetivos -------------------------------------------------------------------------


## [{goal, remaining}] (remaining = quanto falta; 0 = cumprido).
static func goal_progress(state: Dictionary) -> Array:
	var out: Array = []
	for goal in state.level.goals:
		var remaining := 0
		match str(goal.type):
			"collect":
				remaining = maxi(0, int(goal.count) - int(state.collected[int(goal.kind)]))
			"clay":
				for row in state.clay:
					for hp in row:
						if int(hp) > 0:
							remaining += 1
			"score":
				remaining = maxi(0, int(goal.target) - int(state.score))
		out.append({"goal": goal, "remaining": remaining})
	return out


static func goals_met(state: Dictionary) -> bool:
	return goal_progress(state).all(func(g): return g.remaining == 0)


static func stars(level: Dictionary, won: bool, score: int) -> int:
	if not won:
		return 0
	return 3 if score >= int(level.stars[1]) else (2 if score >= int(level.stars[0]) else 1)


# --- A jogada ---------------------------------------------------------------------------


## Tira as casas marcadas (e o que os especiais atingidos explodirem), cria os especiais
## novos, racha o barro, faz cair e completa. Devolve a etapa para a tela animar.
static func _clear_and_fall(w: Dictionary, level: Dictionary, cascade: int, initial: Array, spawns: Array, detonated: Dictionary, blasts: Array) -> Dictionary:
	var rows := int(level.rows)
	var cols := int(level.cols)
	var board: Array = w.board
	var spawn_at := {}
	for s in spawns:
		spawn_at[s.cell] = s
	var marked := {}
	var queue: Array = initial.duplicate()
	var head := 0
	while head < queue.size():
		var cell: int = queue[head]
		head += 1
		if marked.has(cell):
			continue
		var r := _row(cell)
		var c := _col(cell)
		var tile: Variant = _at(board, r, c)
		if tile == null:
			continue
		marked[cell] = true
		# Especial atingido explode (uma vez), menos a pedra que acabou de virar especial.
		if str(tile.special) != "" and not detonated.has(int(tile.id)) and not spawn_at.has(cell):
			detonated[int(tile.id)] = true
			blasts.append({"row": r, "col": c, "special": str(tile.special)})
			queue.append_array(_blast_area(board, r, c, str(tile.special)))
	var cleared: Array = []
	var created: Array = []
	var tiles := 0
	var clay_hits := 0
	var cells: Array = marked.keys()
	cells.sort()
	for cell in cells:
		var r := _row(cell)
		var c := _col(cell)
		var tile: Dictionary = board[r][c]
		if int(w.clay[r][c]) > 0:
			w.clay[r][c] = int(w.clay[r][c]) - 1
			clay_hits += 1
		if int(tile.kind) >= 0:
			w.collected[int(tile.kind)] += 1
		tiles += 1
		if spawn_at.has(cell):
			var sp: Dictionary = spawn_at[cell]
			board[r][c] = _tile(int(tile.id), -1 if sp.special == "urim" else int(sp.kind), str(sp.special))
			created.append({"id": int(tile.id), "row": r, "col": c, "special": str(sp.special)})
		else:
			cleared.append({"id": int(tile.id), "row": r, "col": c, "kind": int(tile.kind), "special": str(tile.special)})
			board[r][c] = null
	var after_clear := _copy(board)
	var clay_now := _copy(w.clay)
	# Queda, coluna por coluna, e pedras novas do alto.
	for c in cols:
		var write := rows - 1
		for r in range(rows - 1, -1, -1):
			var t: Variant = board[r][c]
			if t != null:
				board[r][c] = null
				board[write][c] = t
				write -= 1
		for r in range(write, -1, -1):
			board[r][c] = _tile(int(w.nextId), next_int(w.rng, int(level.kinds)))
			w.nextId = int(w.nextId) + 1
	var delta := tiles * SCORE_PER_TILE * (cascade + 1) + blasts.size() * SCORE_PER_BLAST + clay_hits * SCORE_PER_CLAY
	w.score = int(w.score) + delta
	return {"cascade": cascade, "cleared": cleared, "blasts": blasts, "created": created, "afterClear": after_clear, "clay": clay_now, "afterFall": _copy(board), "scoreDelta": delta}


## Combinações que se formaram sozinhas, com os especiais que nascem delas (ou {}).
static func _matches_of(board: Array, prefer: Array) -> Dictionary:
	var runs := find_runs(board)
	if runs.is_empty():
		return {}
	var cells: Array = []
	var spawns: Array = []
	for group in _group_runs(runs):
		cells.append_array(group.cells.keys())
		var s := _special_for(group, board, prefer)
		if not s.is_empty():
			s["kind"] = int(group.kind)
			spawns.append(s)
	return {"cells": cells, "spawns": spawns}


## Efeito da troca de dois especiais (ou de um Urim com qualquer pedra); [] se não há.
static func _combo_cells(w: Dictionary, a: Dictionary, b: Dictionary) -> Array:
	var board: Array = w.board
	var rows := board.size()
	var cols := (board[0] as Array).size()
	var all := func(pred: Callable) -> Array:
		var out: Array = []
		for y in rows:
			for x in cols:
				if board[y][x] != null and pred.call(board[y][x]):
					out.append(_key(y, x))
		return out
	var sa := str(a.t.special)
	var sb := str(b.t.special)
	if sa == "urim" and sb == "urim":
		return all.call(func(_t): return true)
	if sa == "urim" or sb == "urim":
		var urim: Dictionary = a if sa == "urim" else b
		var other: Dictionary = b if sa == "urim" else a
		var kind := int(other.t.kind)
		if str(other.t.special) != "":
			# Todas as pedras daquela cor viram o especial (raios alternam linha e coluna) e explodem.
			for y in rows:
				for x in cols:
					var t: Variant = board[y][x]
					if t != null and int(t.kind) == kind and str(t.special) == "":
						var sp := "bomb" if other.t.special == "bomb" else ("row" if (y + x) % 2 else "col")
						board[y][x] = _tile(int(t.id), int(t.kind), sp)
		return [_key(int(urim.r), int(urim.c))] + all.call(func(t): return int(t.kind) == kind)
	if sa == "" or sb == "":
		return []
	var at_r := int(b.r)
	var at_c := int(b.c)
	var lines := func(rs: Array, cs: Array) -> Array:
		var out: Array = []
		for y in rs:
			if y >= 0 and y < rows:
				for x in cols:
					out.append(_key(y, x))
		for x in cs:
			if x >= 0 and x < cols:
				for y in rows:
					out.append(_key(y, x))
		return out
	var is_line := func(s: String) -> bool: return s == "row" or s == "col"
	if is_line.call(sa) and is_line.call(sb):
		return [_key(int(a.r), int(a.c)), _key(int(b.r), int(b.c))] + lines.call([at_r], [at_c])
	if sa == "bomb" and sb == "bomb":
		var out: Array = [_key(int(a.r), int(a.c))]
		for y in range(at_r - 2, at_r + 3):
			for x in range(at_c - 2, at_c + 3):
				if y >= 0 and y < rows and x >= 0 and x < cols:
					out.append(_key(y, x))
		return out
	return [_key(int(a.r), int(a.c)), _key(int(b.r), int(b.c))] + lines.call([at_r - 1, at_r, at_r + 1], [at_c - 1, at_c, at_c + 1])


## Embaralha (sem gastar jogada) até haver jogada e nenhuma trinca pronta.
static func _reshuffle(w: Dictionary, level: Dictionary) -> void:
	var board: Array = w.board
	var cells: Array = []
	for r in int(level.rows):
		for c in int(level.cols):
			if board[r][c] != null and str(board[r][c].special) == "":
				cells.append(_key(r, c))
	for _attempt in 60:
		var tiles: Array = []
		for k in cells:
			tiles.append(board[_row(k)][_col(k)])
		for i in range(tiles.size() - 1, 0, -1):
			var j := next_int(w.rng, i + 1)
			var tmp: Variant = tiles[i]
			tiles[i] = tiles[j]
			tiles[j] = tmp
		for i in cells.size():
			board[_row(cells[i])][_col(cells[i])] = tiles[i]
		if find_runs(board).is_empty() and not find_move(board).is_empty():
			return
	# Muito raro: recolore as pedras comuns (mesmas pedras, cores novas).
	for _attempt in 60:
		for k in cells:
			var r := _row(k)
			var c := _col(k)
			var t: Dictionary = board[r][c]
			board[r][c] = _tile(int(t.id), _pick_kind(board, r, c, int(level.kinds), w.rng), str(t.special))
		if find_runs(board).is_empty() and not find_move(board).is_empty():
			return


## Faz uma jogada [r1, c1, r2, c2]. Jogada que não vale não muda nada (nem gasta jogada).
## {ok: true, state, afterSwap, steps, shuffled (tabuleiro ou null), endBonus} ou {ok: false, reason}.
static func play(state: Dictionary, move: Array) -> Dictionary:
	if state.status != "playing" or int(state.movesLeft) <= 0:
		return {"ok": false, "reason": "over"}
	var r1: int = move[0]
	var c1: int = move[1]
	var r2: int = move[2]
	var c2: int = move[3]
	var rows := int(state.level.rows)
	var cols := int(state.level.cols)
	var inside := func(r: int, c: int) -> bool: return r >= 0 and r < rows and c >= 0 and c < cols
	if not inside.call(r1, c1) or not inside.call(r2, c2):
		return {"ok": false, "reason": "out-of-bounds"}
	if absi(r1 - r2) + absi(c1 - c2) != 1:
		return {"ok": false, "reason": "not-adjacent"}
	var a: Variant = state.board[r1][c1]
	var b: Variant = state.board[r2][c2]
	if a == null or b == null:
		return {"ok": false, "reason": "empty"}
	if not swap_valid(state.board, r1, c1, r2, c2):
		return {"ok": false, "reason": "no-match"}
	var w := {"board": _copy(state.board), "clay": _copy(state.clay), "rng": {"s": int(state.rng)}, "nextId": int(state.nextId), "collected": (state.collected as Array).duplicate(), "score": int(state.score)}
	w.board[r1][c1] = b
	w.board[r2][c2] = a
	var after_swap := _copy(w.board)
	var steps: Array = []
	var detonated := {}
	# Etapa 0: a combinação de especiais, ou as trincas que a troca formou.
	var combo := _combo_cells(w, {"r": r1, "c": c1, "t": b}, {"r": r2, "c": c2, "t": a})
	if not combo.is_empty():
		var blasts: Array = []
		for t in [a, b]:
			if str(t.special) != "":
				detonated[int(t.id)] = true
				var at := [r2, c2] if t == a else [r1, c1]
				blasts.append({"row": at[0], "col": at[1], "special": str(t.special)})
		steps.append(_clear_and_fall(w, state.level, 0, combo, [], detonated, blasts))
	else:
		# A pedra que o jogador arrastou (destino) tem preferência para virar especial.
		var found := _matches_of(w.board, [_key(r2, c2), _key(r1, c1)])
		steps.append(_clear_and_fall(w, state.level, 0, found.cells, found.spawns, detonated, []))
	# Cadeias.
	for cascade in range(1, 50):
		var found := _matches_of(w.board, [])
		if found.is_empty():
			break
		steps.append(_clear_and_fall(w, state.level, cascade, found.cells, found.spawns, detonated, []))
	var moves_left := int(state.movesLeft) - 1
	var won := goals_met({"level": state.level, "collected": w.collected, "clay": w.clay, "score": w.score})
	var end_bonus := 0
	if won:
		end_bonus = moves_left * SCORE_PER_MOVE_LEFT
		w.score = int(w.score) + end_bonus
	var shuffled: Variant = null
	if not won and moves_left > 0 and find_move(w.board).is_empty():
		_reshuffle(w, state.level)
		shuffled = _copy(w.board)
	return {
		"ok": true, "afterSwap": after_swap, "steps": steps, "shuffled": shuffled, "endBonus": end_bonus,
		"state": {
			"level": state.level, "board": _copy(w.board), "clay": w.clay, "rng": int(w.rng.s), "nextId": int(w.nextId),
			"score": int(w.score), "movesLeft": moves_left, "movesUsed": int(state.movesUsed) + 1, "collected": w.collected,
			"status": "won" if won else ("lost" if moves_left <= 0 else "playing"),
		},
	}


## Jogadas a mais (anúncio com prêmio quando as jogadas acabam).
static func add_moves(state: Dictionary, extra: int) -> Dictionary:
	if state.status == "won" or extra <= 0:
		return state
	var s := state.duplicate()
	s.movesLeft = int(s.movesLeft) + extra
	s.status = "playing"
	return s
