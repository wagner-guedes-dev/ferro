// Catálogo compartilhado de exercícios, usado para trocar um exercício por outro do mesmo grupo.
// A chave é o nome da pasta no banco gratuito free-exercise-db (fotos em img/<chave>_0.jpg e _1.jpg).
const GRUPOS = {
  costas: "Costas", biceps: "Bíceps", peito: "Peito", triceps: "Tríceps", ombro: "Ombro",
  quadriceps: "Quadríceps", posterior: "Posterior de coxa", gluteos: "Glúteos", panturrilha: "Panturrilha", abdomen: "Abdômen",
};

const CATALOGO = {};
(function () {
  const add = (g, lista) => Object.entries(lista).forEach(([id, n]) => { CATALOGO[id] = { n, g }; });
  add("costas", {
    "Wide-Grip_Lat_Pulldown": "Puxada frontal (pulley)", "Bent_Over_Barbell_Row": "Remada curvada com barra",
    "Seated_Cable_Rows": "Remada baixa (triângulo)", "Straight-Arm_Pulldown": "Pulldown braço reto",
    "Pullups": "Barra fixa", "One-Arm_Dumbbell_Row": "Remada unilateral com halter", "T-Bar_Row_with_Handle": "Remada cavalinho",
    "Close-Grip_Front_Lat_Pulldown": "Puxada pegada fechada", "Leverage_High_Row": "Remada alta na máquina",
    "Leverage_Iso_Row": "Remada na máquina", "Inverted_Row": "Remada invertida",
    "Straight-Arm_Dumbbell_Pullover": "Pullover com halter", "Hyperextensions_Back_Extensions": "Extensão lombar (banco)",
  });
  add("biceps", {
    "Barbell_Curl": "Rosca direta com barra", "Dumbbell_Alternate_Bicep_Curl": "Rosca alternada com halteres",
    "Hammer_Curls": "Rosca martelo", "Preacher_Curl": "Rosca Scott", "Concentration_Curls": "Rosca concentrada",
    "Standing_Biceps_Cable_Curl": "Rosca na polia baixa", "Incline_Dumbbell_Curl": "Rosca inclinada com halteres",
    "Cable_Hammer_Curls_-_Rope_Attachment": "Rosca martelo na corda", "High_Cable_Curls": "Rosca na polia alta",
    "Close-Grip_EZ_Bar_Curl": "Rosca barra W pegada fechada", "Machine_Preacher_Curls": "Rosca Scott na máquina",
  });
  add("peito", {
    "Barbell_Bench_Press_-_Medium_Grip": "Supino reto com barra", "Incline_Dumbbell_Press": "Supino inclinado com halteres",
    "Butterfly": "Crucifixo na máquina (peck deck)", "Cable_Crossover": "Crossover na polia",
    "Barbell_Incline_Bench_Press_-_Medium_Grip": "Supino inclinado com barra", "Dumbbell_Bench_Press": "Supino reto com halteres",
    "Dips_-_Chest_Version": "Paralelas (peito)", "Incline_Dumbbell_Flyes": "Crucifixo inclinado com halteres",
    "Dumbbell_Flyes": "Crucifixo reto com halteres", "Pushups": "Flexão de braço", "Low_Cable_Crossover": "Crossover na polia baixa",
    "Leverage_Chest_Press": "Supino na máquina",
  });
  add("triceps", {
    "EZ-Bar_Skullcrusher": "Tríceps testa", "Triceps_Pushdown_-_Rope_Attachment": "Tríceps corda na polia",
    "Bench_Dips": "Mergulho no banco", "Dumbbell_One-Arm_Triceps_Extension": "Tríceps francês com halter",
    "Triceps_Pushdown": "Tríceps pulley barra reta", "Tricep_Dumbbell_Kickback": "Tríceps coice",
    "Cable_Rope_Overhead_Triceps_Extension": "Tríceps corda acima da cabeça", "Close-Grip_Barbell_Bench_Press": "Supino fechado",
    "Reverse_Grip_Triceps_Pushdown": "Tríceps pulley invertido", "Triceps_Pushdown_-_V-Bar_Attachment": "Tríceps pulley barra V",
    "Dips_-_Triceps_Version": "Paralelas (tríceps)",
  });
  add("ombro", {
    "Dumbbell_Shoulder_Press": "Desenvolvimento com halteres", "Side_Lateral_Raise": "Elevação lateral",
    "Front_Dumbbell_Raise": "Elevação frontal", "Reverse_Flyes": "Crucifixo inverso (ombro posterior)",
    "Standing_Military_Press": "Desenvolvimento militar em pé", "Arnold_Dumbbell_Press": "Desenvolvimento Arnold",
    "Face_Pull": "Face pull", "Machine_Shoulder_Military_Press": "Desenvolvimento na máquina",
    "Seated_Side_Lateral_Raise": "Elevação lateral sentado", "Cable_Rear_Delt_Fly": "Crucifixo inverso na polia",
    "Dumbbell_Shrug": "Encolhimento com halteres", "Barbell_Shrug": "Encolhimento com barra",
  });
  add("quadriceps", {
    "Barbell_Squat": "Agachamento livre", "Leg_Press": "Leg press 45°", "Leg_Extensions": "Cadeira extensora",
    "Barbell_Lunge": "Afundo com barra", "Dumbbell_Lunges": "Afundo com halteres", "Goblet_Squat": "Agachamento goblet",
    "Barbell_Hack_Squat": "Agachamento hack", "Bodyweight_Squat": "Agachamento sem peso", "Smith_Machine_Squat": "Agachamento no Smith",
    "Front_Barbell_Squat": "Agachamento frontal", "Dumbbell_Step_Ups": "Step-up com halteres",
    "Split_Squat_with_Dumbbells": "Agachamento búlgaro (split squat)", "Barbell_Walking_Lunge": "Passada com barra",
  });
  add("posterior", {
    "Lying_Leg_Curls": "Mesa flexora", "Seated_Leg_Curl": "Cadeira flexora", "Stiff-Legged_Barbell_Deadlift": "Stiff com barra",
    "Romanian_Deadlift": "Levantamento terra romeno", "Stiff-Legged_Dumbbell_Deadlift": "Stiff com halteres", "Good_Morning": "Bom dia (good morning)",
  });
  add("gluteos", {
    "Barbell_Hip_Thrust": "Elevação pélvica (hip thrust)", "Barbell_Glute_Bridge": "Ponte de glúteo com barra",
    "Glute_Kickback": "Glúteo na polia (coice)", "One-Legged_Cable_Kickback": "Coice unilateral na polia",
    "Thigh_Abductor": "Cadeira abdutora", "Sumo_Deadlift": "Terra sumô", "Dumbbell_Rear_Lunge": "Afundo para trás com halteres",
    "Single_Leg_Glute_Bridge": "Ponte de glúteo unilateral", "Butt_Lift_Bridge": "Ponte de glúteo no solo", "Pull_Through": "Pull-through na polia",
  });
  add("panturrilha", {
    "Standing_Calf_Raises": "Panturrilha em pé", "Seated_Calf_Raise": "Panturrilha sentado",
    "Calf_Press_On_The_Leg_Press_Machine": "Panturrilha no leg press", "Standing_Dumbbell_Calf_Raise": "Panturrilha em pé com halter",
    "Donkey_Calf_Raises": "Panturrilha donkey",
  });
  add("abdomen", {
    "Plank": "Prancha", "Cable_Crunch": "Abdominal na polia", "Crunches": "Abdominal tradicional",
    "Hanging_Leg_Raise": "Elevação de pernas na barra", "Russian_Twist": "Giro russo", "Air_Bike": "Abdominal bicicleta",
    "Ab_Roller": "Rodinha abdominal", "Reverse_Crunch": "Abdominal infra", "Side_Bridge": "Prancha lateral",
  });
})();

// Monta um exercício do treino: ex("id da foto", "séries x reps", "descanso").
const ex = (img, s, d) => ({ img, n: CATALOGO[img].n, s, d });
// Exercício realmente usado, considerando uma troca escolhida pelo usuário.
const exEfetivo = (x, troca) => (troca && CATALOGO[troca] ? { ...x, img: troca, n: CATALOGO[troca].n, trocado: true } : x);
// Opções de troca: todos os exercícios do mesmo grupo muscular.
const alternativas = (x) => Object.entries(CATALOGO).filter(([, c]) => c.g === CATALOGO[x.img].g).map(([id, c]) => ({ id, n: c.n }));
