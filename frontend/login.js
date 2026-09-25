/* ============================================================
   DIGÃO GESTÃO — Tela de Login (Ciclo 7)
   Chama POST /api/auth/login e redireciona pro index.
   ============================================================ */

(function () {
  const form = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorEl = document.getElementById('login-error');
  const btnSubmit = document.getElementById('login-submit');
  const toggleBtn = document.getElementById('toggle-password');

  // Se já estiver autenticado, manda pro index
  fetch('/api/auth/me', { credentials: 'include' })
    .then(r => {
      if (r.ok) window.location.replace('/');
    })
    .catch(() => {});

  // Mostrar/esconder senha
  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleBtn.innerHTML = isPassword
      ? '<i class="fa-solid fa-eye-slash"></i>'
      : '<i class="fa-solid fa-eye"></i>';
  });

  // Limpa erro ao digitar
  [usernameInput, passwordInput].forEach(inp => {
    inp.addEventListener('input', () => {
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    errorEl.classList.remove('show');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Preencha usuário e senha.');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Entrando…</span>';

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        showError(data.error || 'Credenciais inválidas.');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>Entrar</span>';
        return;
      }

      // Sucesso
      window.location.replace('/');
    } catch (err) {
      console.error('[login] erro:', err);
      showError('Falha ao conectar. Verifique a rede.');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>Entrar</span>';
    }
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }
})();