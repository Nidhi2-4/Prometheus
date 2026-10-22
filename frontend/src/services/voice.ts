import { SymptomCode } from '../types/health';

// Comprehensive multilingual symptom keyword matcher (Hindi, Marathi, Hinglish, English)
export function matchTranscriptToSymptoms(transcript: string): SymptomCode[] {
  const lower = transcript.toLowerCase().trim();
  const matched = new Set<SymptomCode>();

  const mappings: { code: SymptomCode; keywords: string[] }[] = [
    {
      code: 'chest_pain',
      keywords: [
        'chest', 'छाती', 'छातीत', 'seena', 'chhati', 'sine', 'dil me dard',
        'chest pain', 'chest pressure', 'heavy chest', 'chhati me dard', 'chhati me jalan',
        'छातीत दुखणे', 'छातीत कळ'
      ]
    },
    {
      code: 'sweating',
      keywords: [
        'sweat', 'sweating', 'पसीना', 'घाम', 'pasina', 'paseena', 'gham',
        'cold sweat', 'bahut pasina', 'thanda pasina', 'घाम फुटणे'
      ]
    },
    {
      code: 'arm_jaw_pain',
      keywords: [
        'arm pain', 'jaw pain', 'हाथ में दर्द', 'जबड़े में दर्द', 'हात दुखणे',
        'kandha', 'shoulder pain', 'bahu', 'jabda', 'हातात कळ'
      ]
    },
    {
      code: 'breathlessness',
      keywords: [
        'breath', 'breathless', 'सांस', 'दम', 'श्वास', 'saans', 'sans', 'dam', 'shwas',
        'shortness of breath', 'saans fulna', 'saans phoolna', 'dam lagna',
        'chalne me dikkat', 'चालताना दम'
      ]
    },
    {
      code: 'breathlessness_at_rest',
      keywords: [
        'breathless at rest', 'बैठे-बैठे सांस', 'विश्रांतीच्या वेळी', 'baithe baithe saans',
        'bina chale saans', 'letne par saans'
      ]
    },
    {
      code: 'headache',
      keywords: [
        'headache', 'सिरदर्द', 'डोके', 'डोकेदुखी', 'सर दर्द', 'sar dard', 'sir dard',
        'matha dukh', 'sar bhari', 'doke dukhne', 'head ache', 'matha'
      ]
    },
    {
      code: 'severe_headache',
      keywords: [
        'severe headache', 'तेज सिरदर्द', 'तीव्र डोकेदुखी', 'tez sar dard', 'bahut tez dard',
        'achanak sar dard', 'extreme headache'
      ]
    },
    {
      code: 'dizziness',
      keywords: [
        'dizzy', 'dizziness', 'चक्कर', 'भोवळ', 'chakkar', 'chakar', 'bhowal',
        'sir ghumna', 'head spinning', 'chakar aana'
      ]
    },
    {
      code: 'blurred_vision',
      keywords: [
        'vision', 'blur', 'धुंधला', 'अस्पष्ट', 'dhundhla', 'dhundla', 'blurry',
        'dhundhla dikhna', 'kam dikhna', 'अस्पष्ट दिसणे'
      ]
    },
    {
      code: 'sudden_vision_loss',
      keywords: [
        'vision loss', 'दिखना बंद', 'दिसेनासे', 'blind', 'aankhon ke aage andhera',
        'sudden blindness'
      ]
    },
    {
      code: 'one_side_weakness',
      keywords: [
        'one side', 'एक तरफ कमजोरी', 'एका बाजूला', 'paralysis', 'lakwa', 'ek taraf',
        'sunn padna', 'haath sunn', 'pair sunn'
      ]
    },
    {
      code: 'face_drooping',
      keywords: [
        'face drooping', 'चेहरा टेढ़ा', 'तोंड वाकडे', 'tedha chehra', 'face drop'
      ]
    },
    {
      code: 'slurred_speech',
      keywords: [
        'slurred', 'लड़खड़ाहट', 'अडखळणे', 'ladkharahat', 'bolne me dikkat',
        'jeebh ladkhadana', 'speech trouble'
      ]
    },
    {
      code: 'fainting',
      keywords: [
        'faint', 'fainting', 'बेहोश', 'बेशुद्ध', 'behosh', 'behoshi', 'beshuddh',
        'pass out', 'black out'
      ]
    },
    {
      code: 'seizure',
      keywords: [
        'seizure', 'fits', 'दौरा', 'आचके', 'fit', 'jhatka', 'daura', 'mirgi'
      ]
    },
    {
      code: 'fever',
      keywords: [
        'fever', 'बुखार', 'ताप', 'temperature', 'bukhar', 'taap', 'tap',
        'badan garam', 'high temp', 'thand lagna'
      ]
    },
    {
      code: 'cough',
      keywords: [
        'cough', 'खांसी', 'खोकला', 'khansi', 'khasi', 'khokla', 'dhaska', 'dry cough'
      ]
    },
    {
      code: 'nausea',
      keywords: [
        'nausea', 'vomit', 'उल्टी', 'मळमळ', 'जी मिचलाना', 'ulti', 'malmal', 'vomiting',
        'jee ghabrana', 'jee michlana', 'malli'
      ]
    },
    {
      code: 'persistent_vomiting',
      keywords: [
        'persistent vomiting', 'repeated vomit', 'बार-बार उल्टी', 'सतत उलट्या', 'bar bar ulti'
      ]
    },
    {
      code: 'coughing_blood',
      keywords: [
        'cough blood', 'खून की खांसी', 'रक्त खोकला', 'thook me khoon', 'coughing blood',
        'khansi me khoon'
      ]
    },
    {
      code: 'excessive_thirst',
      keywords: [
        'thirst', 'thirsty', 'प्यास', 'तहान', 'pyas', 'pyaas', 'tahan', 'bahut pyas',
        'gala sukhna', 'dry throat'
      ]
    },
    {
      code: 'frequent_urination',
      keywords: [
        'urination', 'urine', 'पेशाब', 'लघवी', 'toilet', 'peshab', 'laghvi', 'mutra',
        'bar bar peshab', 'frequent toilet', 'pee'
      ]
    },
    {
      code: 'fatigue',
      keywords: [
        'tired', 'fatigue', 'कमजोरी', 'थकान', 'अशक्तपणा', 'thakan', 'kamzori', 'sust',
        'exhausted', 'weakness', 'thakva', 'ashaktpana'
      ]
    },
    {
      code: 'swelling',
      keywords: [
        'swelling', 'swell', 'सूजन', 'सूज', 'sujan', 'sooj', 'soojan', 'pair me sujan',
        'swollen feet', 'swollen leg'
      ]
    },
    {
      code: 'confusion',
      keywords: [
        'confusion', 'भ्रम', 'गोंधळ', 'confused', 'bhram', 'kuch samajh nahi aana', 'gondhal'
      ]
    },
    {
      code: 'extreme_drowsiness',
      keywords: [
        'drowsy', 'सुस्ती', 'झोप', 'bahut susti', 'hosh na rehna', 'drowsiness'
      ]
    },
    {
      code: 'fruity_breath',
      keywords: [
        'fruity breath', 'फल जैसी महक', 'sweet breath', 'acetone'
      ]
    },
    {
      code: 'vaginal_bleeding',
      keywords: [
        'bleeding', 'रक्तस्राव', 'खून जाना', 'vaginal bleeding', 'khoon aana'
      ]
    },
    {
      code: 'reduced_baby_movement',
      keywords: [
        'baby movement', 'बच्चे की हलचल', 'बाळाची हालचाल', 'baby kick', 'bacha nahi hil raha',
        'balachi halchal'
      ]
    },
    {
      code: 'convulsions',
      keywords: [
        'convulsion', 'गर्भावस्था में झटके', 'pregnancy fits', 'jhatke'
      ]
    },
  ];

  for (const item of mappings) {
    if (item.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      matched.add(item.code);
    }
  }

  return Array.from(matched);
}
