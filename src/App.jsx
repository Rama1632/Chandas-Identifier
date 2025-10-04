import React, { useState, useRef, useEffect } from 'react';

// --- Mock shadcn/ui components using Tailwind for single-file mandate ---
// Note: This defines the UI components locally since external imports are not allowed in a single file.
const Button = React.forwardRef(({ className, variant = "default", size = "default", ...props }, ref) => {
  const baseClasses = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  let variantClasses = "bg-gray-900 text-white hover:bg-gray-800"; // default

  if (variant === "ghost") {
    variantClasses = "hover:bg-gray-100 text-gray-900";
  }

  let sizeClasses = "h-10 py-2 px-4"; // default

  return (
    <button
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

const Card = ({ className, ...props }) => (
  <div className={`rounded-xl border bg-card text-card-foreground shadow-lg ${className}`} {...props} />
);
const CardHeader = ({ className, ...props }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props} />
);
const CardTitle = ({ className, ...props }) => (
  <h3 className={`text-2xl font-semibold leading-none tracking-tight ${className}`} {...props} />
);
const CardContent = ({ className, ...props }) => (
  <div className={`p-6 pt-0 ${className}`} {...props} />
);
// --- End Mock UI Components ---

/**
 * @typedef {object} ChatMessage
 * @property {'user' | 'bot'} role
 * @property {string} content
 * @property {string} [pattern]
 * @property {string} [chandasType]
 */

// Utility functions for Devanagari character analysis

function isDevanagari(char) {
  const code = char.charCodeAt(0);
  return code >= 0x0900 && code <= 0x097F;
}

function isVowel(char) {
  // Checks for both independent vowels (अ-औ) and dependent vowel marks (matras)
  const code = char.charCodeAt(0);
  return (code >= 0x0905 && code <= 0x0914) || (code >= 0x093E && code <= 0x094C) || char === 'अ' || char === 'आ' || char === 'इ' || char === 'ई' || char === 'उ' || char === 'ऊ' || char === 'ए' || char === 'ऐ' || char === 'ओ' || char === 'औ';
}

function isShortVowel(char) {
  // Short Vowels: अ, इ, उ, ऋ, ऌ (independent) and ि, ु, ृ (dependent)
  const shortVowels = new Set(['अ', 'इ', 'उ', 'ऋ', 'ऌ', 'ि', 'ु', 'ृ']);
  return shortVowels.has(char);
}

function isConsonant(char) {
  // SAFETY FIX: Prevent TypeError if the character argument is undefined (occurs at end of string)
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 0x0915 && code <= 0x0939) || (code >= 0x0958 && code <= 0x0961) || (code >= 0x0978 && code <= 0x097F);
}

function isHalant(char) {
  return char === '\u094D';
}

function isAnusvaraVisarga(char) {
  return char === '\u0902' || char === '\u0903'; // Anusvara (ं) or Visarga (ः)
}

/**
 * Calculates the Laghu (L) and Guru (G) pattern for a given Devanagari text.
 * @param {string} text The Sanskrit/Hindi verse line.
 * @returns {string} The Laghu-Guru pattern string (e.g., "L G L L G G").
 */
function getLaghuGuru(text) {
  // Remove whitespace and punctuation (like danda/double danda) that aren't part of the syllabic structure
  const cleanedText = text.replace(/[\s\|।॥]/g, '');
  const patternParts = [];
  let i = 0;

  while (i < cleanedText.length) {
    let char = cleanedText[i];
    let isGuru = false;
    let currentVowelChar = '';

    // Skip non-Devanagari or Halant at the start of iteration
    if (!isDevanagari(char) || isHalant(char)) {
      i++;
      continue;
    }

    // --- 1. Identify the Syllable Core (Consonant + Vowel or Vowel) ---

    if (isConsonant(char)) {
      i++; // Move past the consonant

      // Look for dependent vowel mark (matra)
      if (i < cleanedText.length && isVowel(cleanedText[i])) {
        currentVowelChar = cleanedText[i];
        i++;
      } else {
        // Implied 'a' (अ), which is a short vowel.
        currentVowelChar = 'अ';
      }
    }
    // 2. Independent Vowel
    else if (isVowel(char)) {
      currentVowelChar = char;
      i++;
    } else {
      // Should not happen if initial check passes, but for safety
      i++;
      continue;
    }

    // --- 2. Syllable Length Determination (Rules) ---

    // Rule A: Intrinsic Vowel Length (Guru if long vowel: ā, ī, ū, e, ai, o, au)
    if (isVowel(currentVowelChar) && !isShortVowel(currentVowelChar)) {
      isGuru = true;
    }

    // Rule B: Syllable followed by Anusvara (ं) or Visarga (ः)
    if (i < cleanedText.length && isAnusvaraVisarga(cleanedText[i])) {
      isGuru = true;
      i++; // Consume Anusvara/Visarga
    }

    // CRITICAL FIX: If 'i' moved past the end of the string, the syllable is complete.
    // Push the result and break the loop to prevent errors in Rule C.
    if (i >= cleanedText.length) {
      patternParts.push(isGuru ? 'G' : 'L');
      break;
    }

    // Rule C: Syllable followed by a conjunct consonant (Samyuktakshara)
    // A preceding short syllable becomes Guru if followed by a consonant cluster (conjunct).
    let nextChar = cleanedText[i];
    // Check for Halant followed by Consonant (e.g., ष् + क = ष्क)
    let isNextHalant = (nextChar === '\u094D' && i + 1 < cleanedText.length && isConsonant(cleanedText[i + 1]));
    // Check for Consonant followed by Consonant (implied conjunct, e.g., क्र, क्त)
    let isNextSamyuktakshara = isConsonant(nextChar) && i + 1 < cleanedText.length && isConsonant(cleanedText[i + 1]);

    if (!isGuru && (isNextHalant || isNextSamyuktakshara)) {
      // Only a *short* syllable can be made Guru by the following conjunct.
      isGuru = true;
    }

    // After processing the syllable, push the result.
    patternParts.push(isGuru ? 'G' : 'L');
  }
  return patternParts.join(' ');
}

/**
 * Identifies the Chandas (meter type) based on the Laghu-Guru pattern.
 * @param {string} pattern The Laghu-Guru pattern string.
 * @returns {string} The identified Chandas type.
 */
function getChandasType(pattern) {
  const lines = pattern.split(' | ');
  const linePatterns = lines.map(line => line.replace(/ /g, '').trim());
  const firstLineLength = lines[0].split(' ').filter(p => p.length > 0).length;

  if (firstLineLength === 0) {
    return 'No recognizable meter structure.';
  }

  // Basic check for syllable consistency (for Vrtta - syllabic meters)
  if (lines.some(l => l.split(' ').filter(p => p.length > 0).length !== firstLineLength)) {
    return `Irregular (${firstLineLength} syllables in first line, varying others)`;
  }

  const linePattern = linePatterns[0]; // Use the first line for Vrtta pattern matching

  // Common syllabic meters (Vritta) based on number of syllables and required pattern
  const chandasMap = {
    // 8 Syllables
    'अनुष्टुप् (Anuṣṭubh)': { syllables: 8, patterns: ['LGLGLGLG', 'GLGLGLGL', 'LLGLGLGG', 'GGLGLGLG'] },
    'गायत्री (Gāyatrī)': { syllables: 8, patterns: ['LGLGLGLG'] },

    // 11 Syllables
    'इन्द्रवज्रा (Indravajrā)': { syllables: 11, patterns: ['GGLGGLGGLGG'] }, // T T J G G
    'उपेन्द्रवज्रा (Upendravajrā)': { syllables: 11, patterns: ['LGLGGLGGLGG'] }, // J T J G G
    'शालिनी (Śālinī)': { syllables: 11, patterns: ['GGLGLGGLGGL'] }, // M T T G G

    // 12 Syllables
    'वंशस्थ (Vaṃśastha)': { syllables: 12, patterns: ['LGLGGLGLGLGG'] }, // J T J R
    'भुजङ्गप्रयात (Bhujaṅgaprayāta)': { syllables: 12, patterns: ['LGGLGGLGGLGG'] }, // Y Y Y Y
    'द्रुतविलम्बित (Drutavilambita)': { syllables: 12, patterns: ['LLLGLLGLLGLG'] }, // N B B R

    // 14 Syllables
    'वसन्ततिलका (Vasantatilakā)': { syllables: 14, patterns: ['GGLGLGLGLGGGLG'] },

    // 17 Syllables
    'मन्दाक्रान्ता (Mandākrāntā)': { syllables: 17, patterns: ['GGGLGLLLLLLGGLGG'] },
  };

  const candidates = Object.entries(chandasMap).filter(([, data]) => data.syllables === firstLineLength);

  if (candidates.length === 0) {
    return `Unknown ${firstLineLength}-syllable meter.`;
  }

  // Check for exact pattern match
  for (const [name, data] of candidates) {
    // Only check if the actual pattern matches the length of the expected pattern
    if (data.patterns.includes(linePattern.substring(0, data.syllables))) {
      return name;
    }
  }

  // If no exact Vrutta match, return a generic identification
  return `Candidate ${firstLineLength}-syllable meter (No exact match found: ${linePattern.substring(0, 15)}...).`;
}


export default function App() {
  const [inputVerse, setInputVerse] = useState('');
  // Initialize chatHistory as an empty array, relying on runtime structure
  const [chatHistory, setChatHistory] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLearningPanel, setShowLearningPanel] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [currentChandas, setCurrentChandas] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const renderPatternVisualization = (pattern, originalText) => {
    const lines = pattern.split(' | ');
    const textLines = originalText.split('\n');
    return (
      <div className="pattern-visualization p-4 bg-gray-100 rounded-lg shadow-inner">
        {lines.map((linePattern, index) => (
          <div key={index} className="mb-4 last:mb-0">
            <div className="text-line font-medium text-lg mb-2 text-gray-800">
              {/* Display the original text line, trimming whitespace and showing placeholder if empty */}
              {textLines[index] ? textLines[index].trim() : `Line ${index + 1}`}
            </div>
            <div className="pattern-line flex flex-wrap gap-1">
              {linePattern.split(' ').filter(char => char.length > 0).map((char, charIndex) => (
                <span
                  key={charIndex}
                  className={`px-3 py-1 rounded-md text-sm font-mono shadow-sm font-bold ${char === 'L'
                      ? 'bg-green-200 text-green-800 border border-green-300'
                      : 'bg-red-200 text-red-800 border border-red-300'
                    }`}
                >
                  {char}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const getLearningTip = (chandasType) => {
    const tips = {
      'त्रिष्टुभ् (Triṣṭubh)': 'Triṣṭubh has 11 syllables per quarter and is known for its majestic rhythm. Often used in heroic poetry and the Rigveda.',
      'जगती (Jagatī)': 'Jagatī consists of 12 syllables per quarter and creates a flowing, elegant rhythm. Commonly found in Vedic hymns.',
      'भुजङ्गप्रयात (Bhujaṅgaprayāta)': 'Bhujaṅgaprayāta means "serpent\'s movement" (4 yagan/LGG). It has a distinctive, rapid rhythm often used in devotional poetry.',
      'इन्द्रवज्रा (Indravajrā)': 'Indravajrā (G G L | G G L | G L G | G G) is a powerful 11-syllable meter often used for dramatic and forceful expressions in classical poetry.',
      'उपेन्द्रवज्रा (Upendravajrā)': 'Upendravajrā (L G L | G G L | G L G | G G) is a variation of Indravajrā, lighter in tone, used in lyrical compositions.',
      'वंशस्थ (Vaṃśastha)': 'Vaṃśastha (L G L | G G L | L G L | G L G) is known for its bamboo-like regularity (J-T-J-R) and is used in many classical works.',
      'अनुष्टुप् (Anuṣṭubh)': 'Anuṣṭubh is the most common meter with 8 syllables per quarter, highly flexible, and used in epics like Mahabharata.',
      'गायत्री (Gāyatrī)': 'Gāyatrī has 24 syllables in three lines of 8 (8-8-8), famous for the Gāyatrī Mantra, symbolizing enlightenment.',
      'शालिनी (Śālinī)': 'Śālinī (G G L | G L G | G L G | G L) is an 11-syllable meter with a graceful, measured pace.',
      'वसन्ततिलका (Vasantatilakā)': 'Vasantatilakā is a 14-syllable meter, evocative of the spring season (T-B-J-J-G-G), used for descriptions of nature and love.',
      'मन्दाक्रान्ता (Mandākrāntā)': 'Mandākrāntā is a 17-syllable meter, known for its slow and majestic gait (M-B-N-T-T-G-G).',
    };
    return tips[chandasType] || `This is an interesting meter (${chandasType}). Learn more about its structure and usage.`;
  };

  const getExampleVerse = (chandasType) => {
    const examples = {
      'त्रिष्टुभ् (Triṣṭubh)': 'अग्ने यं यज्ञमध्वरं विश्वतः परिभूरसि ।\nस देवानेहि वक्षि ॥',
      'जगती (Jagatī)': 'यः शुक्र इव सूर्ये ज्योतिषा महान् विबाति देवानां नामभिर्विमान इव ।',
      'भुजङ्गप्रयात (Bhujaṅgaprayāta)': 'नवाम्भुजैर्मार्द्रसगन्धिभिः स्निग्धः ।\nप्रियामुखैस्ते हि समाः स्मरः कालः ॥',
      'इन्द्रवज्रा (Indravajrā)': 'स्यादिन्द्रवज्रा यदि तौ जगौ गः ।\nतेजस्वि नावधीतमस्तु मा विद्विषावहै ।',
      'उपेन्द्रवज्रा (Upendravajrā)': 'उपेंद्रवज्रा जतजास्ततो गौ ।\nत्वमेव माता च पिता त्वमेव ।',
      'वंशस्थ (Vaṃśastha)': 'जतो वंशस्थमुदीरितं जरौ ।\nप्रकृत्या यत् सुन्दरमेतदिष्टम् ॥',
      'अनुष्टुप् (Anuṣṭubh)': 'धर्मक्षेत्रे कुरुक्षेत्रे\nसमवेता युयुत्सवः ।\nमामकाः पाण्डवाश्चैव\nकिमकुर्वत सञ्जय ॥',
      'गायत्री (Gāyatrī)': 'ओम भूर्भुवस्स्वः ।\nतत्सवितुर्वरेण्यं ।\nभर्गो देवस्य धीमहि ।\nधियो यो नः प्रचोदयात् ॥',
      'वसन्ततिलका (Vasantatilakā)': 'उक्ता वसन्ततिलका तभजा जगौ गः ।\nतद् दृष्ट्वोदितं वदनं रमणाननं च ॥',
      'मन्दाक्रान्ता (Mandākrāntā)': 'मेघालोके भवति सुखिनोऽप्यन्यथावृत्ति चेतः ।\nकण्ठाश्लेषप्रणयिनि जने किं पुनर्दूरसंस्थे ॥',
    };
    return examples[chandasType] || 'No typical example available for this meter. Try searching online or checking the chat for tips!';
  };

  const handleIdentifyChandas = () => {
    if (!inputVerse.trim()) return;
    setIsProcessing(true);
    /** @type {ChatMessage} */
    const userMessage = { role: 'user', content: inputVerse };
    setChatHistory((prev) => [...prev, userMessage]);
    setShowLearningPanel(false); // Hide panel for new analysis

    // --- INSTANT ANALYSIS (removed setTimeout) ---
    const lines = inputVerse.split('\n').map(l => l.trim()).filter(l => l);

    // Process each line and join them with ' | ' for multi-line analysis display
    const patterns = lines.map(getLaghuGuru);
    const pattern = patterns.join(' | ');
    const chandasType = getChandasType(pattern);

    /** @type {ChatMessage} */
    const newBotMessage = {
      role: 'bot',
      content: 'The analysis is complete! Here is the detailed scansion and meter identification based on classical Sanskrit prosody rules.',
      pattern,
      chandasType,
    };

    setChatHistory((prev) => [...prev, newBotMessage]);
    setCurrentChandas(chandasType);
    setShowLearningPanel(true);
    setIsProcessing(false);
    // --- END INSTANT ANALYSIS ---
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !currentChandas) return;
    const msgToSend = inputMessage;

    setChatHistory([...chatHistory, { role: 'user', content: inputMessage }]);
    setInputMessage('');
    setIsProcessing(true);

    // Simple rule-based response for chat functionality
    setTimeout(() => {
      let response = 'I can provide examples, tips, or more details about the meter. Ask me about **"example"** or **"tip"**!';
      const lowerMsg = msgToSend.toLowerCase();

      const lastAnalysis = chatHistory.slice().reverse().find(msg => msg.role === 'bot' && msg.pattern);

      if (lowerMsg.includes('example') || lowerMsg.includes('show another')) {
        response = `Here is a classic example verse in the **${currentChandas}** meter:\n\n${getExampleVerse(currentChandas)}`;
      } else if (lowerMsg.includes('tip') || lowerMsg.includes('learn') || lowerMsg.includes('about')) {
        response = getLearningTip(currentChandas);
      } else if (lowerMsg.includes('pattern') || lowerMsg.includes('gana')) {
        response = `The pattern for the first quarter of **${currentChandas}** is: ${lastAnalysis?.pattern?.split(' | ')[0] || 'L G L L G G...'} (L: Laghu, G: Guru). If this is a Vrutta (syllabic meter), it follows a specific sequence of Gaṇas (feet).`;
      } else if (lowerMsg.includes('laghu') || lowerMsg.includes('guru')) {
        response = 'A **Laghu** (L) syllable is short (e.g., implied "a," "i," "u"). A **Guru** (G) syllable is long (e.g., long vowel "ā," "ī," "ū," or a syllable followed by Anusvāra, Visarga, or a conjunct consonant).';
      }

      setChatHistory((prev) => [...prev, { role: 'bot', content: response }]);
      setIsProcessing(false);
    }, 1000); // Kept 1 second delay for the chat responses to simulate thought
  };

  // Set the correct font family for Devanagari display
  const devanagariFont = "font-['Noto_Sans_Devanagari',_Arial,_sans-serif]";

  return (
    <div className={`min-h-screen ${devanagariFont} bg-gradient-to-br from-indigo-50 to-violet-50 p-6`}>
      <div className="max-w-7xl mx-auto shadow-2xl rounded-xl bg-white overflow-hidden">
        {/* Header */}
        <header className="text-center py-8 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="flex items-center justify-center mb-4">
            <div className="text-5xl mr-4">📜</div>
            <h1 className="text-5xl font-bold">Chandas Identifier</h1>
          </div>
          <p className="text-xl">AI-powered Sanskrit poetic meter analysis with interactive chat</p>
        </header>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:col-span-3 gap-8 p-8">
          {/* Input Section */}
          <Card className="lg:col-span-1 shadow-lg">
            <CardHeader className="bg-blue-100 p-6">
              <CardTitle className="text-2xl text-blue-800">Enter Sanskrit Verse</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-3">
                <label htmlFor="verse-input" className="text-sm font-semibold text-gray-700">
                  Devanagari Text (हिन्दी/संस्कृत)
                </label>
                <textarea
                  id="verse-input"
                  value={inputVerse}
                  onChange={(e) => setInputVerse(e.target.value)}
                  placeholder="Paste your Sanskrit verse here (e.g., Bhagavad Gita verse). Separate padas (quarters) with new lines."
                  className={`w-full min-h-[150px] p-4 border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${devanagariFont}`}
                />
              </div>
              <Button
                onClick={handleIdentifyChandas}
                disabled={isProcessing || !inputVerse.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-md"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Analyzing...
                  </span>
                ) : (
                  'Identify Chandas'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Chat Interface */}
          <Card className="lg:col-span-2 shadow-lg">
            <CardHeader className="bg-green-100 p-6">
              <CardTitle className="text-2xl flex items-center text-green-800">
                <div className="w-4 h-4 bg-green-500 rounded-full mr-3 animate-pulse"></div>
                Sanskrit Teacher Bot
              </CardTitle>
            </CardHeader>
            <CardContent className='p-6 pt-0'>
              <div className="h-[450px] overflow-y-auto p-4 bg-gray-50 rounded-lg shadow-inner">
                {chatHistory.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <div className="text-7xl mb-6">📖</div>
                    <p className="text-lg">Enter a Sanskrit verse to begin analysis</p>
                    <p className="text-sm mt-2 text-gray-400">Try a famous one like: **धर्मक्षेत्रे कुरुक्षेत्रे**</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {chatHistory.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl p-5 shadow-md ${message.role === 'user'
                              ? 'bg-blue-100 text-blue-900 rounded-tr-sm'
                              : 'bg-white border border-gray-200 rounded-tl-sm'
                            }`}
                        >
                          {message.role === 'user' ? (
                            <div>
                              <div className="font-semibold text-blue-800 mb-3">Your Input</div>
                              <div className={`text-lg font-devanagari whitespace-pre-line ${devanagariFont}`}>{message.content}</div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold text-green-700 mb-3">Sanskrit Teacher</div>
                              <div className="mb-4 text-gray-800 whitespace-pre-line">{message.content}</div>
                              {message.pattern && message.chandasType && (
                                <div className="space-y-4">
                                  <div>
                                    <div className="font-semibold text-sm text-gray-600 mb-1">Detected Meter:</div>
                                    <div className="font-bold text-xl text-purple-700">{message.chandasType}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-sm text-gray-600 mb-2">Pattern Analysis (L: Laghu, G: Guru):</div>
                                    {renderPatternVisualization(
                                      message.pattern,
                                      // Find the most recent user input message associated with this bot response
                                      chatHistory.find((msg, idx) => idx < index && msg.role === 'user')?.content || ''
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
              <div className="mt-4 flex border-t border-gray-200 pt-4">
                <textarea
                  className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="Ask a question about the analysis (e.g., 'What is a tip?', 'Show an example')..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={1}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isProcessing || !inputMessage.trim() || !currentChandas}
                  className="rounded-l-none bg-green-600 hover:bg-green-700 text-white font-medium"
                >
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Learning Panel */}
        {showLearningPanel && currentChandas && (
          <Card className="m-8 shadow-lg">
            <CardHeader className="bg-yellow-100 p-6">
              <CardTitle className="text-2xl flex items-center justify-between text-yellow-800">
                <span>Learning Panel: **{currentChandas}**</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLearningPanel(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Close
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-blue-50 p-6 rounded-xl shadow-inner border border-blue-200">
                  <h3 className="font-extrabold text-2xl mb-3 text-blue-800">
                    What is it?
                  </h3>
                  <p className="text-gray-700 leading-relaxed text-lg">
                    {getLearningTip(currentChandas)}
                  </p>
                </div>
                <div className="bg-yellow-50 p-6 rounded-xl shadow-inner border border-yellow-200">
                  <h3 className="font-extrabold text-2xl mb-3 text-yellow-800">Example Verse</h3>
                  <div className={`text-lg leading-relaxed whitespace-pre-line ${devanagariFont}`}>
                    {getExampleVerse(currentChandas)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}