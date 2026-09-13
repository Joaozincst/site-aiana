const WHATSAPP_NUMERO = "5571981017940";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBtASWpYiwUQ-UK1ZWy1yTGiEW7Wh2J84g",
  authDomain: "am-studio-barbearia.firebaseapp.com",
  projectId: "am-studio-barbearia",
  storageBucket: "am-studio-barbearia.firebasestorage.app",
  messagingSenderId: "794516904487",
  appId: "1:794516904487:web:a9907d9cc140efe2b4cc02",
};

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

const HORA_INICIO = "09:00";
const HORA_FIM = "18:00";
const INTERVALO_MINUTOS = 40;

document.addEventListener("DOMContentLoaded", () => {
  iniciarMenu();
  iniciarAno();
  iniciarDataMinima();
  iniciarGradeDeHorarios();
  iniciarFormulario();
});

/* Menu hambúrguer */
function iniciarMenu() {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("nav");

  btn.addEventListener("click", () => {
    const aberto = nav.classList.toggle("is-open");
    btn.classList.toggle("is-active", aberto);
    btn.setAttribute("aria-expanded", String(aberto));
  });

  nav.querySelectorAll(".nav__link").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      btn.classList.remove("is-active");
      btn.setAttribute("aria-expanded", "false");
    });
  });
}

/* Data mínima = hoje */
function iniciarDataMinima() {
  const inputData = document.getElementById("dia");
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  inputData.setAttribute("min", `${ano}-${mes}-${dia}`);
}

/* Grade de horários de 40 em 40 min */
function gerarHorarios() {
  const [horaIni, minIni] = HORA_INICIO.split(":").map(Number);
  const [horaFim, minFim] = HORA_FIM.split(":").map(Number);

  const inicioMin = horaIni * 60 + minIni;
  const fimMin = horaFim * 60 + minFim;

  const horarios = [];
  for (let atual = inicioMin; atual + INTERVALO_MINUTOS <= fimMin; atual += INTERVALO_MINUTOS) {
    const h = String(Math.floor(atual / 60)).padStart(2, "0");
    const m = String(atual % 60).padStart(2, "0");
    horarios.push(`${h}:${m}`);
  }
  return horarios;
}

function iniciarGradeDeHorarios() {
  const inputData = document.getElementById("dia");
  inputData.addEventListener("change", () => renderizarHorarios(inputData.value));
}

async function buscarHorariosOcupados(data) {
  const snapshot = await db.collection("agendamentos").where("data", "==", data).get();
  return snapshot.docs.map((doc) => doc.data().hora);
}

async function renderizarHorarios(data) {
  const grid = document.getElementById("slotsGrid");
  const inputHoraSelecionada = document.getElementById("horaSelecionada");
  inputHoraSelecionada.value = "";

  if (!data) {
    grid.innerHTML = '<p class="slots__hint">Escolha o dia para ver os horários disponíveis.</p>';
    return;
  }

  grid.innerHTML = '<p class="slots__hint">Carregando horários...</p>';

  let ocupados = [];
  try {
    ocupados = await buscarHorariosOcupados(data);
  } catch (erro) {
    console.error(erro);
    grid.innerHTML = '<p class="slots__hint">Não foi possível carregar os horários agora.</p>';
    return;
  }

  const todosHorarios = gerarHorarios();
  grid.innerHTML = "";

  todosHorarios.forEach((horario) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "slot";
    botao.textContent = horario;

    if (ocupados.includes(horario)) {
      botao.classList.add("slot--taken");
      botao.disabled = true;
    } else {
      botao.addEventListener("click", () => {
        grid.querySelectorAll(".slot").forEach((b) => b.classList.remove("slot--selected"));
        botao.classList.add("slot--selected");
        inputHoraSelecionada.value = horario;
      });
    }

    grid.appendChild(botao);
  });
}

/* Reserva o horário no banco antes de liberar o WhatsApp.
   Usa o próprio dia+hora como ID do documento e uma transação:
   se o documento já existir, a reserva é recusada — evita que
   duas pessoas peguem o mesmo horário ao mesmo tempo. */
async function reservarHorario({ data, hora, nome, servico }) {
  const slotId = `${data}_${hora}`;
  const slotRef = db.collection("agendamentos").doc(slotId);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(slotRef);
    if (doc.exists) {
      throw new Error("HORARIO_OCUPADO");
    }
    transaction.set(slotRef, {
      nome,
      servico,
      data,
      hora,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}
function iniciarAno() {
  document.getElementById("ano").textContent = new Date().getFullYear();
}

/* Formulário de agendamento */
function iniciarFormulario() {
  const form = document.getElementById("form");

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nome = document.getElementById("nome");
    const servico = document.getElementById("servico");
    const dia = document.getElementById("dia");
    const horaSelecionada = document.getElementById("horaSelecionada");
    const botaoSubmit = form.querySelector("button[type='submit']");

    if (!nome.value.trim() || !servico.value || !dia.value || !horaSelecionada.value) {
      alert("Por favor, preencha todos os campos e escolha um horário.");
      return;
    }

    const servicoTexto = servico.options[servico.selectedIndex].text;

    botaoSubmit.disabled = true;
    botaoSubmit.textContent = "Confirmando...";

    try {
      await reservarHorario({
        data: dia.value,
        hora: horaSelecionada.value,
        nome: nome.value.trim(),
        servico: servicoTexto,
      });
    } catch (erro) {
      if (erro.message === "HORARIO_OCUPADO") {
        alert("Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.");
        renderizarHorarios(dia.value);
      } else {
        console.error(erro);
        alert("Não foi possível confirmar agora. Tente novamente em instantes.");
      }
      botaoSubmit.disabled = false;
      botaoSubmit.textContent = "Confirmar agendamento";
      return;
    }

    const diaFormatado = formatarData(dia.value);
    const mensagem =
      `Olá! Gostaria de agendar um horário pelo site. ` +
      `Nome: ${nome.value.trim()} | Serviço: ${servicoTexto} | Dia: ${diaFormatado} | Horário: ${horaSelecionada.value}`;

    const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
    window.open(link, "_blank");

    botaoSubmit.disabled = false;
    botaoSubmit.textContent = "Confirmar agendamento";
  });
}

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}