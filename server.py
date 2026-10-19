"""Servidor local: serve o site e faz a ponte segura com a API do Claude.

A chave da API fica no servidor (variável ANTHROPIC_API_KEY ou arquivo .env),
nunca no navegador. Uso:  python server.py   ->  http://localhost:5500
"""
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 5500))
MODELO = os.environ.get("CLAUDE_MODEL", "claude-haiku-5-5")
RAIZ = os.path.dirname(os.path.abspath(__file__))
PRIVADOS = {".env", ".env.example", "server.py", "launch.json", "render.yaml", ".gitignore", "requirements.txt"}
PUBLICOS = {"/login.html", "/manifest.webmanifest", "/icon.svg"}


def ler_env(nome):
    if os.environ.get(nome):
        return os.environ[nome].strip()
    try:
        with open(os.path.join(RAIZ, ".env"), encoding="utf-8") as f:
            for linha in f:
                if linha.startswith(nome + "="):
                    return linha.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return ""


def chave_api():
    return ler_env("ANTHROPIC_API_KEY")


# Senha de acesso (obrigatória ao publicar online). Sem APP_PASSWORD, o site fica aberto.
# APP_PASSWORD abre o plano "ele"; APP_PASSWORD_ELA abre o plano "ela". O mesmo site atende os dois.
SENHAS = {p: v for p, v in (("ele", ler_env("APP_PASSWORD")), ("ela", ler_env("APP_PASSWORD_ELA"))) if v}
SENHA = bool(SENHAS)


def token_de(perfil):
    return hmac.new(SENHAS[perfil].encode(), b"ferro-sessao-" + perfil.encode(), hashlib.sha256).hexdigest()


# Perfil do site: "ele" ou "ela" (variável APP_PERFIL). Define o plano carregado e a persona da IA.
PERFIL = ler_env("APP_PERFIL") or "ele"  # perfil usado quando não há senha (uso local)
if PERFIL not in ("ele", "ela"):
    PERFIL = "ele"

ESTILO = """Responda de forma curta, prática e amigável, com listas quando ajudar. Dê trocas de alimentos com quantidades. Ao analisar progresso, use os dados fornecidos e seja honesto. Não faça diagnóstico médico; em caso de dor, lesão ou condição de saúde, recomende um profissional.

Dados atuais do app:
"""
SISTEMAS = {
    "ele": """Você é o coach pessoal (personal trainer + nutricionista esportivo) do Wagner, em português do Brasil.
Perfil: 1,66 m, 66 kg, objetivo ganhar massa muscular. Treina de segunda a sexta (costas+bíceps, peito+tríceps, perna+ombro, e repete costas/peito); perna só na quarta; sábado e domingo descansa. Volta da academia a pé (~4 km). Rotina fixa: acorda 05:30, treina às 06:30 (cerca de 1h), dorme 21:30 (8h de sono); refeições: pré-treino 05:50, café pós-treino 07:45, lanche 10:30, almoço 12:30, lanche 16:00, jantar 19:00, ceia 20:45. Meta: ~2700 kcal, ~150 g de proteína, 2,5 L de água.
""",
    "ela": """Você é a coach pessoal (personal trainer + nutricionista esportiva) da usuária, em português do Brasil.
Perfil: mulher, 1,64 m, 60 kg, objetivo ganhar massa magra com ênfase em glúteos e pernas. Treina de segunda a sexta (glúteo+posterior, costas+bíceps, quadríceps+panturrilha, peito+ombro+tríceps, glúteo+perna completa); sábado e domingo descansa. Rotina: acorda 05:30, treina às 06:30, dorme 21:30; refeições: pré-treino 05:50, café pós-treino 07:45, lanche 10:30, almoço 12:30, lanche 16:00, jantar 19:00, ceia 20:45. Meta: ~2200 kcal, ~120 g de proteína, 2,3 L de água.
""",
}



class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=RAIZ, **kw)

    def _json(self, codigo, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def perfil_sessao(self):
        """Perfil da sessão (pelo cookie), ou None se não estiver logado."""
        if not SENHA:
            return PERFIL
        for parte in self.headers.get("Cookie", "").split(";"):
            k, _, v = parte.strip().partition("=")
            if k == "sessao":
                p, _, tok = v.partition(".")
                if p in SENHAS and hmac.compare_digest(tok, token_de(p)):
                    return p
        return None

    def autenticado(self):
        return self.perfil_sessao() is not None

    def arquivo_dados(self):
        return os.path.join(RAIZ, "data", f"dados-{self.perfil_sessao() or PERFIL}.json")

    def do_GET(self):
        caminho = self.path.split("?")[0]
        nome = os.path.basename(caminho)
        if caminho not in PUBLICOS and not self.autenticado():
            if caminho.startswith("/api/"):
                return self._json(401, {"erro": "Faça login."})
            self.send_response(302)
            self.send_header("Location", "/login.html")
            self.end_headers()
            return
        if caminho == "/api/dados":
            try:
                with open(self.arquivo_dados(), encoding="utf-8") as f:
                    return self._json(200, json.load(f))
            except (OSError, ValueError):
                return self._json(200, {"ts": 0, "dados": {}})
        if caminho == "/perfil.js":
            with open(os.path.join(RAIZ, f"perfil-{self.perfil_sessao() or PERFIL}.js"), "rb") as f:
                corpo = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            return self.wfile.write(corpo)
        if nome in PRIVADOS or nome.startswith("perfil-") or "/." in caminho or caminho.startswith("/data/"):
            return self.send_error(404)
        super().do_GET()

    def _login(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            senha = str(json.loads(self.rfile.read(min(n, 2000))).get("senha", ""))
        except (ValueError, AttributeError):
            return self._json(400, {"erro": "Requisição inválida."})
        perfil = next((p for p, v in SENHAS.items() if hmac.compare_digest(senha.encode(), v.encode())), None)
        if not SENHA:
            perfil = PERFIL
        if perfil:
            corpo = json.dumps({"ok": True}).encode()
            self.send_response(200)
            seguro = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            self.send_header("Set-Cookie", f"sessao={perfil}.{token_de(perfil) if SENHA else 'x'}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax{seguro}")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            return self.wfile.write(corpo)
        time.sleep(1.5)  # freia tentativas de adivinhar a senha
        self._json(403, {"erro": "Senha incorreta."})

    def do_PUT(self):
        if not self.autenticado():
            return self._json(401, {"erro": "Faça login."})
        if self.path != "/api/dados":
            return self.send_error(404)
        n = int(self.headers.get("Content-Length", 0))
        if n > 5_000_000:
            return self._json(413, {"erro": "Dados grandes demais."})
        try:
            dados = json.loads(self.rfile.read(n))
            assert isinstance(dados.get("dados"), dict)
        except (ValueError, AssertionError, AttributeError):
            return self._json(400, {"erro": "Dados inválidos."})
        arq = self.arquivo_dados()
        os.makedirs(os.path.dirname(arq), exist_ok=True)
        with open(arq, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False)
        self._json(200, {"ok": True})

    def do_POST(self):
        if self.path == "/api/login":
            return self._login()
        if not self.autenticado():
            return self._json(401, {"erro": "Faça login."})
        if self.path != "/api/chat":
            return self.send_error(404)
        chave = chave_api()
        if not chave:
            return self._json(503, {"erro": "IA não configurada. Crie o arquivo .env com ANTHROPIC_API_KEY=sua_chave e reinicie o servidor."})
        try:
            n = int(self.headers.get("Content-Length", 0))
            dados = json.loads(self.rfile.read(n))
            msgs = [{"role": m["role"], "content": str(m["content"])[:4000]}
                    for m in dados.get("messages", [])[-12:] if m.get("role") in ("user", "assistant")]
            contexto = str(dados.get("contexto", ""))[:4000]
        except (ValueError, KeyError, TypeError):
            return self._json(400, {"erro": "Requisição inválida."})
        corpo = json.dumps({"model": MODELO, "max_tokens": 900, "system": SISTEMAS[self.perfil_sessao() or PERFIL] + ESTILO + contexto, "messages": msgs}).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages", data=corpo, method="POST",
            headers={"x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                resp = json.load(r)
            texto = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
            self._json(200, {"texto": texto or "(sem resposta)"})
        except urllib.error.HTTPError as e:
            detalhe = ""
            try:
                detalhe = json.load(e).get("error", {}).get("message", "")
            except Exception:
                pass
            self._json(502, {"erro": f"A API respondeu {e.code}. {detalhe}"})
        except Exception as e:
            self._json(502, {"erro": f"Falha ao contatar a API: {e}"})


if __name__ == "__main__":
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except OSError:
        ip = "IP-DO-PC"
    print(f"No PC:      http://localhost:{PORT}")
    print(f"No celular: http://{ip}:{PORT}  (mesmo Wi-Fi do PC)")
    print(f"Perfil: {PERFIL}")
    print(f"Senhas: {', '.join(SENHAS) if SENHA else 'DESLIGADAS (defina APP_PASSWORD antes de publicar)'}")
    print(f"IA {'ativada' if chave_api() else 'sem chave - veja .env.example'}")
    ThreadingHTTPServer((os.environ.get("HOST", "0.0.0.0"), PORT), Handler).serve_forever()
