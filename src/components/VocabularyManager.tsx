import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Edit3, Save, Check, RotateCcw } from 'lucide-react';

interface VocabularyManagerProps {
  vocabularyData: Record<string, { word: string; def: string; example?: string }[]>;
  onSavePage: (pageName: string, words: { word: string; def: string; example?: string }[]) => void;
  onResetWords?: () => void;
}

export const VocabularyManager: React.FC<VocabularyManagerProps> = ({
  vocabularyData,
  onSavePage,
  onResetWords
}) => {
  const pageNames = Object.keys(vocabularyData);
  const [selectedPage, setSelectedPage] = useState<string>(pageNames[0] || '1페이지');
  const [editingWords, setEditingWords] = useState<{ word: string; def: string; example?: string }[]>(
    vocabularyData[selectedPage] || []
  );

  useEffect(() => {
    if (vocabularyData[selectedPage]) {
      setEditingWords([...vocabularyData[selectedPage]]);
    } else if (pageNames.length > 0) {
      setSelectedPage(pageNames[0]);
      setEditingWords([...(vocabularyData[pageNames[0]] || [])]);
    }
  }, [vocabularyData, selectedPage]);

  const [newPageName, setNewPageName] = useState('');
  const [showAddPage, setShowAddPage] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSelectPage = (pageName: string) => {
    setSelectedPage(pageName);
    setEditingWords([...(vocabularyData[pageName] || [])]);
    setSaveSuccess(false);
  };

  const handleWordChange = (index: number, field: 'word' | 'def' | 'example', value: string) => {
    const updated = [...editingWords];
    updated[index] = { ...updated[index], [field]: value };
    setEditingWords(updated);
    setSaveSuccess(false);
  };

  const handleAddWordRow = () => {
    setEditingWords([...editingWords, { word: '', def: '', example: '' }]);
    setSaveSuccess(false);
  };

  const handleRemoveWordRow = (index: number) => {
    setEditingWords(editingWords.filter((_, i) => i !== index));
    setSaveSuccess(false);
  };

  const handleSave = () => {
    const cleaned = editingWords.filter((w) => w.word.trim() && w.def.trim());
    onSavePage(selectedPage, cleaned);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleCreateNewPage = () => {
    if (!newPageName.trim()) return;
    const name = newPageName.trim();
    if (vocabularyData[name]) {
      alert('이미 존재하는 페이지 이름입니다.');
      return;
    }
    onSavePage(name, [
      { word: '예시단어', def: '예시 단어의 설명입니다.' }
    ]);
    setSelectedPage(name);
    setEditingWords([{ word: '예시단어', def: '예시 단어의 설명입니다.' }]);
    setNewPageName('');
    setShowAddPage(false);
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          📚 교재 어휘 단어장 관리
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          선생님께서 원하시는 맞춤 어휘 단원을 추가하거나 수정하실 수 있습니다.
        </p>

        {/* Page Tab Selector */}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          {pageNames.map((pName) => (
            <button
              key={pName}
              onClick={() => handleSelectPage(pName)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                selectedPage === pName
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {pName} ({vocabularyData[pName]?.length || 0})
            </button>
          ))}

          <button
            onClick={() => setShowAddPage(!showAddPage)}
            className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-bold transition flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 페이지 추가</span>
          </button>

          {onResetWords && (
            <button
              onClick={onResetWords}
              className="px-3 py-2 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1 ml-auto"
              title="기본 교재 어휘(1~13페이지) 데이터로 초기화/복원"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>기본 어휘 복원</span>
            </button>
          )}
        </div>

        {/* Add New Page Inline Form */}
        {showAddPage && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <input
              type="text"
              value={newPageName}
              onChange={(e) => setNewPageName(e.target.value)}
              placeholder="예: 11페이지 또는 국어 3단원"
              className="px-3 py-2 border border-emerald-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none"
            />
            <button
              onClick={handleCreateNewPage}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
            >
              생성
            </button>
          </div>
        )}
      </div>

      {/* Editing Word List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📖 {selectedPage} 어휘 수정</span>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              총 {editingWords.length}개 어휘
            </span>
          </h3>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddWordRow}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>어휘 추가</span>
            </button>

            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              {saveSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? '저장 완료!' : '변경사항 저장'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {editingWords.map((item, index) => (
            <div key={index} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center gap-3">
              <div className="w-full sm:w-1/4">
                <label className="text-[10px] font-bold text-slate-500 block mb-1">어휘 (단어)</label>
                <input
                  type="text"
                  value={item.word}
                  onChange={(e) => handleWordChange(index, 'word', e.target.value)}
                  placeholder="단어"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none"
                />
              </div>

              <div className="w-full sm:w-2/4">
                <label className="text-[10px] font-bold text-slate-500 block mb-1">뜻 풀이 (의미)</label>
                <input
                  type="text"
                  value={item.def}
                  onChange={(e) => handleWordChange(index, 'def', e.target.value)}
                  placeholder="단어의 뜻 설명"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="w-full sm:w-1/4 flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">예문 (선택)</label>
                  <input
                    type="text"
                    value={item.example || ''}
                    onChange={(e) => handleWordChange(index, 'example', e.target.value)}
                    placeholder="예문"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => handleRemoveWordRow(index)}
                  className="p-2 text-rose-500 hover:bg-rose-100 rounded-lg mt-4"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
