// Dados do plano: treinos, dieta e compras. Edite aqui para ajustar.
// Perfil: 1,66 m, 66 kg. Treina seg-sex, volta da academia a pé (~4 km).
const PERFIL = { altura: 1.66, peso: 66 };
// Meta de ganho de massa: ~+300 kcal acima da manutenção (já contando a caminhada),
// ~2,2 g de proteína por kg e ~38 ml de água por kg.
const META = { agua: 2500, kcal: 2700, proteina: 150 };
// Horários fixos da rotina (sono de 8h).
const ROTINA = { acordar: "05:30", treino: "06:30", dormir: "21:30" };
const CAMINHADA = { texto: "Caminhada de volta da academia", info: "~4 km · queima ≈ 250 kcal" };

// "img" = pasta do exercício no banco gratuito free-exercise-db (2 fotos: início e fim do movimento).
const TREINOS = {
  costas: {
    nome: "Costas + Bíceps", emoji: "🔙",
    dica: "Puxe com as costas, não com o braço. Controle a descida (2s).",
    exercicios: [
      { n: "Puxada frontal (pulley)", s: "4 x 10-12", d: "60-90s", img: "Wide-Grip_Lat_Pulldown" },
      { n: "Remada curvada com barra", s: "4 x 8-10", d: "90s", img: "Bent_Over_Barbell_Row" },
      { n: "Remada baixa (triângulo)", s: "3 x 10-12", d: "60-90s", img: "Seated_Cable_Rows" },
      { n: "Pulldown braço reto", s: "3 x 12-15", d: "60s", img: "Straight-Arm_Pulldown" },
      { n: "Rosca direta com barra", s: "3 x 8-10", d: "60-90s", img: "Barbell_Curl" },
      { n: "Rosca alternada com halteres", s: "3 x 10-12", d: "60s", img: "Dumbbell_Alternate_Bicep_Curl" },
      { n: "Rosca martelo", s: "3 x 12", d: "60s", img: "Hammer_Curls" },
    ],
  },
  costas2: {
    nome: "Costas + Bíceps", emoji: "🔙",
    dica: "Variação do treino de segunda: mesmos músculos, exercícios diferentes.",
    exercicios: [
      { n: "Barra fixa (ou puxada aberta)", s: "4 x 6-10", d: "90s", img: "Pullups" },
      { n: "Remada unilateral com halter", s: "4 x 10 cada lado", d: "60-90s", img: "One-Arm_Dumbbell_Row" },
      { n: "Remada cavalinho / máquina", s: "3 x 10-12", d: "90s", img: "T-Bar_Row_with_Handle" },
      { n: "Puxada supinada (pegada fechada)", s: "3 x 10-12", d: "60s", img: "Close-Grip_Front_Lat_Pulldown" },
      { n: "Rosca Scott", s: "3 x 10-12", d: "60s", img: "Preacher_Curl" },
      { n: "Rosca concentrada", s: "3 x 12", d: "60s", img: "Concentration_Curls" },
      { n: "Rosca na polia baixa", s: "2 x 15", d: "45s", img: "Standing_Biceps_Cable_Curl" },
    ],
  },
  peito: {
    nome: "Peito + Tríceps", emoji: "💪",
    dica: "Escápulas juntas e peito aberto no supino. Não trave o cotovelo.",
    exercicios: [
      { n: "Supino reto com barra", s: "4 x 8-10", d: "90-120s", img: "Barbell_Bench_Press_-_Medium_Grip" },
      { n: "Supino inclinado com halteres", s: "4 x 10", d: "90s", img: "Incline_Dumbbell_Press" },
      { n: "Crucifixo na máquina (peck deck)", s: "3 x 12", d: "60s", img: "Butterfly" },
      { n: "Crossover na polia", s: "3 x 12-15", d: "60s", img: "Cable_Crossover" },
      { n: "Tríceps testa", s: "3 x 10", d: "60-90s", img: "EZ-Bar_Skullcrusher" },
      { n: "Tríceps corda na polia", s: "3 x 12", d: "60s", img: "Triceps_Pushdown_-_Rope_Attachment" },
      { n: "Mergulho no banco", s: "3 x 12", d: "60s", img: "Bench_Dips" },
    ],
  },
  peito2: {
    nome: "Peito + Tríceps", emoji: "💪",
    dica: "Variação: comece pelo inclinado para dar prioridade à parte alta do peito.",
    exercicios: [
      { n: "Supino inclinado com barra", s: "4 x 8-10", d: "90-120s", img: "Barbell_Incline_Bench_Press_-_Medium_Grip" },
      { n: "Supino reto com halteres", s: "4 x 10", d: "90s", img: "Dumbbell_Bench_Press" },
      { n: "Paralelas (peito)", s: "3 x 8-12", d: "90s", img: "Dips_-_Chest_Version" },
      { n: "Crucifixo inclinado com halteres", s: "3 x 12", d: "60s", img: "Incline_Dumbbell_Flyes" },
      { n: "Tríceps francês com halter", s: "3 x 10-12", d: "60s", img: "Dumbbell_One-Arm_Triceps_Extension" },
      { n: "Tríceps pulley barra reta", s: "3 x 12", d: "60s", img: "Triceps_Pushdown" },
      { n: "Tríceps coice", s: "2 x 15", d: "45s", img: "Tricep_Dumbbell_Kickback" },
    ],
  },
  perna: {
    nome: "Perna + Ombro", emoji: "🦵",
    dica: "Único dia de perna da semana: capriche! Aqueça bem joelho e quadril antes.",
    exercicios: [
      { n: "Agachamento livre", s: "4 x 8-10", d: "120s", img: "Barbell_Squat" },
      { n: "Leg press 45°", s: "4 x 10-12", d: "90s", img: "Leg_Press" },
      { n: "Cadeira extensora", s: "3 x 12-15", d: "60s", img: "Leg_Extensions" },
      { n: "Mesa flexora", s: "3 x 12", d: "60s", img: "Lying_Leg_Curls" },
      { n: "Stiff com barra", s: "3 x 10", d: "90s", img: "Stiff-Legged_Barbell_Deadlift" },
      { n: "Panturrilha em pé", s: "4 x 15", d: "45s", img: "Standing_Calf_Raises" },
      { n: "Desenvolvimento com halteres", s: "4 x 10", d: "90s", img: "Dumbbell_Shoulder_Press" },
      { n: "Elevação lateral", s: "3 x 12-15", d: "45s", img: "Side_Lateral_Raise" },
    ],
  },
  descanso: {
    nome: "Descanso", emoji: "😴",
    dica: "Fim de semana livre: o músculo cresce no descanso. Durma 7-9h e mantenha a dieta e a água.",
    exercicios: [],
    semCaminhada: true,
  },
};

// 0 = domingo ... 6 = sábado
const SEMANA = [
  { abrev: "D", nome: "Domingo", treino: "descanso" },
  { abrev: "S", nome: "Segunda", treino: "costas" },
  { abrev: "T", nome: "Terça", treino: "peito" },
  { abrev: "Q", nome: "Quarta", treino: "perna" },
  { abrev: "Q", nome: "Quinta", treino: "costas2" },
  { abrev: "S", nome: "Sexta", treino: "peito2" },
  { abrev: "S", nome: "Sábado", treino: "descanso" },
];

// Cada refeição tem várias opções: escolha a que preferir.
// Rotina: acorda 05:30, treina 06:30 (cerca de 1h), dorme 21:30 (8h de sono).
const REFEICOES = [
  {
    id: "pre", hora: "05:50", nome: "Pré-treino", emoji: "⚡",
    opcoes: [
      { t: "Banana com pasta de amendoim", d: "1 banana + 1 fatia de pão + 1 col. pasta de amendoim + café", k: 280, p: 9 },
      { t: "Torrada com ovo e mel", d: "2 torradas + 1 ovo cozido + fio de mel + café", k: 260, p: 11 },
      { t: "Iogurte com fruta", d: "200g iogurte + 1 banana + 1 col. mel + café", k: 240, p: 9 },
    ],
  },
  {
    id: "cafe", hora: "07:45", nome: "Café pós-treino", emoji: "🍳",
    opcoes: [
      { t: "Ovos e pão", d: "3 ovos mexidos + 2 fatias de pão integral + 1 banana + café", k: 520, p: 28 },
      { t: "Tapioca recheada", d: "Tapioca (3 col. sopa de goma) + 2 ovos + queijo branco + 1 fatia de mamão + 1 scoop de whey", k: 520, p: 42 },
      { t: "Aveia proteica", d: "50g de aveia + 250ml de leite + 1 scoop de whey + 1 banana", k: 560, p: 38 },
    ],
  },
  {
    id: "lanche1", hora: "10:30", nome: "Lanche da manhã", emoji: "🍌",
    opcoes: [
      { t: "Iogurte com granola", d: "200g iogurte natural/grego + 25g granola + 1 fruta", k: 250, p: 14 },
      { t: "Sanduíche de frango", d: "Pão integral + 80g frango desfiado + requeijão light", k: 300, p: 24 },
      { t: "Shake + fruta", d: "1 scoop de whey com água + 1 maçã + 10g castanhas", k: 230, p: 26 },
    ],
  },
  {
    id: "almoco", hora: "12:30", nome: "Almoço", emoji: "🍛",
    opcoes: [
      { t: "Frango, arroz e feijão", d: "130g peito de frango grelhado + 120g arroz + 1 concha feijão + salada", k: 600, p: 42 },
      { t: "Carne moída com batata-doce", d: "130g patinho moído + 180g batata-doce + legumes refogados + salada", k: 620, p: 38 },
      { t: "Peixe com arroz e legumes", d: "130g tilápia/salmão + 120g arroz + legumes no vapor + fio de azeite", k: 580, p: 36 },
      { t: "Macarrão com carne", d: "100g macarrão (cru) + 120g carne moída + molho de tomate + salada", k: 640, p: 38 },
    ],
  },
  {
    id: "pos", hora: "16:00", nome: "Lanche da tarde", emoji: "🥤",
    opcoes: [
      { t: "Whey + banana", d: "1 scoop de whey com água + 1 banana + 20g aveia", k: 300, p: 28 },
      { t: "Vitamina de ganho", d: "1 scoop de whey + 250ml leite + 1 banana + 2 col. aveia", k: 450, p: 34 },
      { t: "Iogurte com whey e fruta", d: "200g iogurte + 1 scoop whey + 1 fruta + mel", k: 350, p: 32 },
    ],
  },
  {
    id: "jantar", hora: "19:00", nome: "Jantar", emoji: "🍽️",
    opcoes: [
      { t: "Omelete completa + arroz", d: "3 ovos (omelete com legumes) + 80g arroz + salada", k: 470, p: 28 },
      { t: "Frango, batata e legumes", d: "130g frango + 180g batata-inglesa/doce + legumes no vapor", k: 480, p: 36 },
      { t: "Carne com purê e salada", d: "130g carne magra + purê de batata + salada verde + fio de azeite", k: 520, p: 34 },
      { t: "Wrap proteico", d: "2 wraps/tortilhas + 120g frango + queijo + alface e tomate", k: 500, p: 36 },
    ],
  },
  {
    id: "ceia", hora: "20:45", nome: "Ceia", emoji: "🌙",
    opcoes: [
      { t: "Iogurte + castanhas", d: "200g iogurte natural + 15g castanhas/amêndoas", k: 220, p: 12 },
      { t: "Queijo cottage + fruta", d: "150g cottage + 1 fruta + 1 col. mel", k: 200, p: 18 },
      { t: "Leite com aveia", d: "300ml de leite + 30g aveia + canela", k: 280, p: 14 },
    ],
  },
];

// Lista de compras para 1 semana (quantidades aproximadas).
const COMPRAS = [
  { cat: "🥩 Proteínas", itens: [
    "Peito de frango — 1,2 kg", "Patinho moído — 800 g", "Tilápia ou salmão — 500 g",
    "Ovos — 30 unid. (2,5 dúzias)", "Whey protein — 1 pote (se acabar)", "Queijo branco / cottage — 400 g",
  ]},
  { cat: "🍚 Carboidratos", itens: [
    "Arroz — 1 kg", "Feijão — 500 g", "Batata-doce — 1,2 kg", "Batata-inglesa — 800 g",
    "Macarrão — 500 g", "Aveia em flocos — 500 g", "Pão integral — 2 pacotes",
    "Tapioca (goma) — 500 g", "Tortilhas/wraps — 1 pacote",
  ]},
  { cat: "🥬 Hortifruti", itens: [
    "Banana — 2 dúzias", "Maçã — 6 unid.", "Mamão — 1", "Frutas da estação — à vontade",
    "Alface / folhas — 3 maços", "Tomate — 1 kg", "Brócolis, cenoura, abobrinha — 1 kg",
    "Cebola e alho — 1 saco", "Limão — 6 unid.",
  ]},
  { cat: "🥛 Laticínios", itens: [
    "Leite — 5 litros", "Iogurte natural/grego — 1,5 kg", "Requeijão light — 1", "Mel — 1 pote",
  ]},
  { cat: "🥜 Gorduras boas e extras", itens: [
    "Pasta de amendoim — 1 pote", "Castanhas / amêndoas — 150 g", "Azeite — 1 garrafa",
    "Granola — 1 pacote", "Café — 1 pacote", "Temperos (sal, pimenta, orégano)",
  ]},
  { cat: "🍱 Preparo (marmitas)", itens: [
    "Potes de marmita — 10 unid.", "Saquinhos para congelar",
  ]},
];
