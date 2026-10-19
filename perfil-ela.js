// Perfil dela: mulher, 1,64 m, 60 kg. Foco em ganho de massa magra com ênfase em glúteos e pernas.
// Hipótese de rotina (mesma do plano do Wagner): ajuste os horários abaixo se for diferente.
const NOME = "";
const PERFIL = { altura: 1.64, peso: 60 };
// ~+250 kcal acima da manutenção, ~2 g de proteína/kg e ~38 ml de água/kg.
const META = { agua: 2300, kcal: 2200, proteina: 120 };
const METAPESO = "0,2 a 0,4 kg";
const ROTINA = { acordar: "05:30", treino: "06:30", dormir: "21:30" };
const CAMINHADA = { texto: "Cardio leve (opcional)", info: "20 min de caminhada ou bike · ≈ 120 kcal" };

const TREINOS = {
  gluteo: {
    nome: "Glúteo + Posterior", emoji: "🍑",
    dica: "Foco em sentir o glúteo trabalhar. Suba a carga aos poucos e segure 1s no topo do movimento.",
    exercicios: [
      ex("Barbell_Hip_Thrust", "4 x 10-12", "90s"), ex("Romanian_Deadlift", "4 x 10", "90s"),
      ex("Lying_Leg_Curls", "3 x 12", "60s"), ex("Glute_Kickback", "3 x 12-15 cada lado", "45s"),
      ex("Thigh_Abductor", "3 x 15", "45s"), ex("Plank", "3 x 40s", "45s"),
    ],
  },
  costas: {
    nome: "Costas + Bíceps", emoji: "🔙",
    dica: "Costas forte melhora a postura. Puxe levando os cotovelos para trás, sem balançar o corpo.",
    exercicios: [
      ex("Wide-Grip_Lat_Pulldown", "4 x 10-12", "60-90s"), ex("Seated_Cable_Rows", "4 x 10-12", "60-90s"),
      ex("One-Arm_Dumbbell_Row", "3 x 12 cada lado", "60s"), ex("Straight-Arm_Pulldown", "3 x 12-15", "60s"),
      ex("Reverse_Flyes", "3 x 15", "45s"), ex("Dumbbell_Alternate_Bicep_Curl", "3 x 12", "60s"), ex("Hammer_Curls", "3 x 12", "60s"),
    ],
  },
  quadriceps: {
    nome: "Quadríceps + Panturrilha", emoji: "🦵",
    dica: "Joelhos acompanham a direção dos pés. Desça até onde mantiver a coluna neutra.",
    exercicios: [
      ex("Barbell_Squat", "4 x 10", "90-120s"), ex("Leg_Press", "4 x 12", "90s"), ex("Dumbbell_Lunges", "3 x 12 cada lado", "60s"),
      ex("Leg_Extensions", "3 x 15", "60s"), ex("Standing_Calf_Raises", "4 x 15", "45s"), ex("Cable_Crunch", "3 x 15", "45s"),
    ],
  },
  peito: {
    nome: "Peito + Ombro + Tríceps", emoji: "💪",
    dica: "Treino de parte superior: ombros definidos e braços firmes. Comece leve e aumente a carga com segurança.",
    exercicios: [
      ex("Dumbbell_Bench_Press", "4 x 10", "90s"), ex("Incline_Dumbbell_Press", "3 x 12", "60-90s"), ex("Butterfly", "3 x 12-15", "60s"),
      ex("Dumbbell_Shoulder_Press", "4 x 10", "90s"), ex("Side_Lateral_Raise", "3 x 15", "45s"),
      ex("Triceps_Pushdown_-_Rope_Attachment", "3 x 12", "60s"), ex("Tricep_Dumbbell_Kickback", "3 x 15", "45s"),
    ],
  },
  gluteo2: {
    nome: "Glúteo + Perna completa", emoji: "🔥",
    dica: "Segundo treino de glúteo da semana, com mais variação e um bloco de abdômen no final.",
    exercicios: [
      ex("Sumo_Deadlift", "4 x 10", "90s"), ex("Dumbbell_Rear_Lunge", "3 x 12 cada lado", "60-90s"),
      ex("One-Legged_Cable_Kickback", "3 x 12 cada lado", "45s"), ex("Seated_Leg_Curl", "3 x 12", "60s"),
      ex("Thigh_Abductor", "3 x 15", "45s"), ex("Russian_Twist", "3 x 20", "45s"), ex("Reverse_Crunch", "3 x 15", "45s"),
    ],
  },
  descanso: {
    nome: "Descanso", emoji: "😴",
    dica: "Fim de semana livre: é quando o músculo se recupera e cresce. Durma bem e mantenha a dieta e a água.",
    exercicios: [], semCaminhada: true,
  },
};

const SEMANA = [
  { abrev: "D", nome: "Domingo", treino: "descanso" },
  { abrev: "S", nome: "Segunda", treino: "gluteo" },
  { abrev: "T", nome: "Terça", treino: "costas" },
  { abrev: "Q", nome: "Quarta", treino: "quadriceps" },
  { abrev: "Q", nome: "Quinta", treino: "peito" },
  { abrev: "S", nome: "Sexta", treino: "gluteo2" },
  { abrev: "S", nome: "Sábado", treino: "descanso" },
];

const REFEICOES = [
  {
    id: "pre", hora: "05:50", nome: "Pré-treino", emoji: "⚡",
    opcoes: [
      { t: "Banana com pasta de amendoim", d: "1 banana + 1 fatia de pão + 1 col. chá de pasta de amendoim + café", k: 230, p: 7 },
      { t: "Torrada com ovo", d: "2 torradas + 1 ovo cozido + fio de mel + café", k: 220, p: 10 },
      { t: "Iogurte com fruta", d: "200g iogurte + 1 fruta + café", k: 200, p: 9 },
    ],
  },
  {
    id: "cafe", hora: "07:45", nome: "Café pós-treino", emoji: "🍳",
    opcoes: [
      { t: "Ovos e pão", d: "2 ovos mexidos + 2 fatias de pão integral + 1 fruta + café", k: 400, p: 20 },
      { t: "Tapioca com ovo e queijo", d: "Tapioca (2 col. sopa de goma) + 2 ovos + queijo branco + 1 fatia de mamão", k: 380, p: 20 },
      { t: "Aveia proteica", d: "40g de aveia + 200ml de leite + 1 scoop de whey + 1 banana", k: 440, p: 32 },
    ],
  },
  {
    id: "lanche1", hora: "10:30", nome: "Lanche da manhã", emoji: "🍌",
    opcoes: [
      { t: "Iogurte com granola", d: "200g iogurte natural + 20g granola + 1 fruta", k: 200, p: 12 },
      { t: "Sanduíche de frango", d: "Pão integral + 60g frango desfiado + requeijão light", k: 250, p: 20 },
      { t: "Shake + fruta", d: "1 scoop de whey com água + 1 maçã", k: 180, p: 24 },
    ],
  },
  {
    id: "almoco", hora: "12:30", nome: "Almoço", emoji: "🍛",
    opcoes: [
      { t: "Frango, arroz e feijão", d: "110g peito de frango grelhado + 100g arroz + 1/2 concha de feijão + salada", k: 500, p: 36 },
      { t: "Carne moída com batata-doce", d: "110g patinho moído + 150g batata-doce + legumes refogados + salada", k: 520, p: 32 },
      { t: "Peixe com arroz e legumes", d: "110g tilápia/salmão + 100g arroz + legumes no vapor + fio de azeite", k: 480, p: 30 },
      { t: "Macarrão com carne", d: "80g macarrão (cru) + 100g carne moída + molho de tomate + salada", k: 540, p: 30 },
    ],
  },
  {
    id: "pos", hora: "16:00", nome: "Lanche da tarde", emoji: "🥤",
    opcoes: [
      { t: "Whey + banana", d: "1 scoop de whey com água + 1 banana", k: 240, p: 25 },
      { t: "Vitamina de ganho", d: "1 scoop de whey + 200ml leite + 1 banana + 1 col. aveia", k: 340, p: 28 },
      { t: "Iogurte com whey e fruta", d: "200g iogurte + 1 scoop whey + 1 fruta", k: 280, p: 28 },
    ],
  },
  {
    id: "jantar", hora: "19:00", nome: "Jantar", emoji: "🍽️",
    opcoes: [
      { t: "Omelete completa + arroz", d: "3 ovos (omelete com legumes) + 60g arroz + salada", k: 400, p: 24 },
      { t: "Frango, batata e legumes", d: "110g frango + 150g batata-inglesa/doce + legumes no vapor", k: 400, p: 30 },
      { t: "Carne com purê e salada", d: "110g carne magra + purê de batata + salada verde + fio de azeite", k: 430, p: 28 },
      { t: "Wrap proteico", d: "1 wrap/tortilha + 100g frango + queijo + alface e tomate", k: 400, p: 30 },
    ],
  },
  {
    id: "ceia", hora: "20:45", nome: "Ceia", emoji: "🌙",
    opcoes: [
      { t: "Iogurte + castanhas", d: "200g iogurte natural + 10g castanhas", k: 180, p: 10 },
      { t: "Queijo cottage + fruta", d: "120g cottage + 1 fruta", k: 170, p: 15 },
      { t: "Leite com aveia", d: "250ml de leite + 20g aveia + canela", k: 220, p: 11 },
    ],
  },
];

const COMPRAS = [
  { cat: "🥩 Proteínas", itens: [
    "Peito de frango — 1 kg", "Patinho moído — 600 g", "Tilápia ou salmão — 400 g",
    "Ovos — 24 unid. (2 dúzias)", "Whey protein — 1 pote (se acabar)", "Queijo branco / cottage — 300 g",
  ]},
  { cat: "🍚 Carboidratos", itens: [
    "Arroz — 1 kg", "Feijão — 500 g", "Batata-doce — 1 kg", "Batata-inglesa — 600 g",
    "Macarrão — 500 g", "Aveia em flocos — 500 g", "Pão integral — 2 pacotes",
    "Tapioca (goma) — 500 g", "Tortilhas/wraps — 1 pacote",
  ]},
  { cat: "🥬 Hortifruti", itens: [
    "Banana — 2 dúzias", "Maçã — 6 unid.", "Mamão — 1", "Frutas da estação — à vontade",
    "Alface / folhas — 3 maços", "Tomate — 1 kg", "Brócolis, cenoura, abobrinha — 1 kg",
    "Cebola e alho — 1 saco", "Limão — 6 unid.",
  ]},
  { cat: "🥛 Laticínios", itens: [
    "Leite — 4 litros", "Iogurte natural/grego — 1,2 kg", "Requeijão light — 1", "Mel — 1 pote",
  ]},
  { cat: "🥜 Gorduras boas e extras", itens: [
    "Pasta de amendoim — 1 pote", "Castanhas / amêndoas — 100 g", "Azeite — 1 garrafa",
    "Granola — 1 pacote", "Café — 1 pacote", "Temperos (sal, pimenta, orégano)",
  ]},
  { cat: "🍱 Preparo (marmitas)", itens: [
    "Potes de marmita — 10 unid.", "Saquinhos para congelar",
  ]},
];
