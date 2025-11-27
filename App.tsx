import React, { useState, useEffect, useRef } from 'react';
import { Plus, Image as ImageIcon, Trash, ChevronRight, Settings, Folder, Search, ArrowLeft, Trash2, Lock, Camera, Download, Upload, X, LogOut, AlertCircle, ArrowUp, ArrowDown, FolderPlus, CheckCircle, CheckSquare, FileText, Check, Pencil, LayoutGrid, List as ListIcon, Share2, HardDrive } from 'lucide-react';
import CameraView from './components/CameraView';
import EditView from './components/EditView';
import { ScannedPage, FilterType, AppView, DocumentGroup } from './types';
import { processImage, generatePDF, getPDFBlob } from './utils/imageProcessor';
import { saveDocumentToDB, getAllDocumentsFromDB, deleteDocumentFromDB } from './utils/storage';
import { analyzeDocument, suggestTitleFromText } from './utils/aiHelper';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

export default function App() {
  const [view, setView] = useState<AppView>('HOME');
  
  // Data State
  const [documents, setDocuments] = useState<DocumentGroup[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'LIST' | 'GRID'>('LIST');
  const [storageUsage, setStorageUsage] = useState<string>('0 MB');
  
  // Capture Context State
  const [appendMode, setAppendMode] = useState(false);
  
  // Title Edit State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  
  // Selection / Bulk Mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Confirm Modal State
  const [deleteConfirmState, setDeleteConfirmState] = useState<{ isOpen: boolean, type: 'DOC' | 'PAGE' | 'BULK', id?: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Dynamic Folders
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Lock Screen State
  const [isLocked, setIsLocked] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [storedPasscode, setStoredPasscode] = useState('0000'); // Default
  const [lockError, setLockError] = useState(false);
  
  // Settings / Password Change State
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [changePassMode, setChangePassMode] = useState(false);
  const [passMismatchError, setPassMismatchError] = useState('');
  const [isSmartNaming, setIsSmartNaming] = useState(false); // UI indicator

  // Drag and Drop State
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);

  // Default Folders + Custom
  const baseFolders = [
      { id: 'Personal', color: 'bg-blue-500' },
      { id: 'Work', color: 'bg-emerald-500' },
      { id: 'Receipts', color: 'bg-pink-500' },
  ];

  useEffect(() => {
    loadData();
    const savedPass = localStorage.getItem('app_passcode');
    if (savedPass) setStoredPasscode(savedPass);
    const savedFolders = localStorage.getItem('custom_folders');
    if (savedFolders) setCustomFolders(JSON.parse(savedFolders));
    const savedViewMode = localStorage.getItem('view_mode');
    if (savedViewMode === 'GRID' || savedViewMode === 'LIST') setViewMode(savedViewMode);
  }, []);

  useEffect(() => {
      // Calculate storage usage when documents change
      if (!isLoading) {
          let totalBytes = 0;
          documents.forEach(doc => {
              doc.pages.forEach(page => {
                 totalBytes += page.displayDataUrl.length;
                 // Add logic to approximate DB size if needed, mainly images are the bulk
              });
          });
          setStorageUsage((totalBytes / (1024 * 1024)).toFixed(2) + ' MB');
      }
  }, [documents, isLoading]);

  // Reset title edit state when navigating
  useEffect(() => {
      setIsEditingTitle(false);
      setTempTitle('');
  }, [view, selectedDocId]);

  const loadData = async () => {
    try {
      const savedDocs = await getAllDocumentsFromDB();
      setDocuments(savedDocs);
    } catch (e) {
      console.error("Failed to load DB", e);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerHaptic = () => {
      if (navigator.vibrate) navigator.vibrate(15);
  };

  // --- FOLDER LOGIC ---
  const handleCreateFolder = () => {
      if (newFolderName.trim()) {
          const updated = [...customFolders, newFolderName.trim()];
          setCustomFolders(updated);
          localStorage.setItem('custom_folders', JSON.stringify(updated));
          setNewFolderName('');
          setIsCreatingFolder(false);
          triggerHaptic();
      }
  };

  // --- SELECTION LOGIC ---
  const toggleSelectionMode = () => {
      triggerHaptic();
      if (isSelectionMode) {
          setIsSelectionMode(false);
          setSelectedItems(new Set());
      } else {
          setIsSelectionMode(true);
      }
  };

  const toggleItemSelection = (id: string) => {
      triggerHaptic();
      const newSet = new Set(selectedItems);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedItems(newSet);
  };

  const handleBulkDeleteRequest = () => {
      if (selectedItems.size > 0) {
          triggerHaptic();
          setDeleteConfirmState({ isOpen: true, type: 'BULK' });
      }
  };

  const handleBulkPDF = () => {
      if (selectedItems.size === 0) return;
      triggerHaptic();
      
      // Gather pages from all selected docs
      const selectedDocs = documents.filter(d => selectedItems.has(d.id));
      const allPages = selectedDocs.flatMap(d => d.pages);
      
      if (allPages.length > 0) {
          const name = selectedDocs.length === 1 ? selectedDocs[0].title : `Merged_Scan_${new Date().toISOString().slice(0,10)}`;
          generatePDF(allPages, name);
          setIsSelectionMode(false);
          setSelectedItems(new Set());
      }
  };

  // --- PASSCODE LOGIC ---
  const handlePasscodeEnter = (num: string) => {
      triggerHaptic();
      if (passcode.length < 4) {
          const newPass = passcode + num;
          setPasscode(newPass);
          setLockError(false);
          if (newPass.length === 4) {
              if (newPass === storedPasscode) {
                  setTimeout(() => {
                      setIsLocked(false);
                      setPasscode('');
                  }, 200);
              } else {
                  setLockError(true);
                  if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
                  setTimeout(() => {
                      setPasscode('');
                      setLockError(false);
                  }, 500);
              }
          }
      }
  };

  const handleResetPasscode = () => {
      if(confirm("Reset passcode to default '0000'?")) {
          setStoredPasscode('0000');
          localStorage.setItem('app_passcode', '0000');
          setPasscode('');
          setLockError(false);
          triggerHaptic();
      }
  };

  const handleChangePassword = () => {
      setPassMismatchError('');
      if (newPasscode.length !== 4) {
          setPassMismatchError("Passcode must be 4 digits.");
          return;
      }
      if (newPasscode !== confirmPasscode) {
          setPassMismatchError("Passcodes do not match.");
          return;
      }
      setStoredPasscode(newPasscode);
      localStorage.setItem('app_passcode', newPasscode);
      setChangePassMode(false);
      setNewPasscode('');
      setConfirmPasscode('');
      alert("Passcode updated successfully!");
      triggerHaptic();
  };

  const handleManualLock = () => {
      setIsLocked(true);
      setShowSettings(false);
      setPasscode('');
      triggerHaptic();
  };

  // --- CAPTURE & SMART NAMING LOGIC ---

  const handleCaptureResult = async (dataUrls: string[]) => {
    const timestamp = Date.now();
    
    // Process images and extract dimensions
    const pages: ScannedPage[] = await Promise.all(dataUrls.map(async (url) => {
        const displayUrl = await processImage(url, 0, FilterType.ORIGINAL);
        
        // Load image to get true dimensions
        const img = new Image();
        img.src = displayUrl;
        await new Promise<void>((resolve) => { 
            img.onload = () => resolve(); 
            img.onerror = () => resolve(); 
        });

        return {
            id: generateId(),
            originalDataUrl: url,
            displayDataUrl: displayUrl,
            rotation: 0,
            filter: FilterType.ORIGINAL,
            width: img.width,
            height: img.height,
            createdAt: Date.now()
        };
    }));

    if (pages.length === 0) return;

    if (appendMode && selectedDocId) {
        // APPEND MODE: Add to existing document
        const docIndex = documents.findIndex(d => d.id === selectedDocId);
        if (docIndex > -1) {
            const updatedDoc = {
                ...documents[docIndex],
                pages: [...documents[docIndex].pages, ...pages],
                updatedAt: timestamp
            };
            
            await saveDocumentToDB(updatedDoc);
            setDocuments(prev => {
                const newDocs = [...prev];
                newDocs[docIndex] = updatedDoc;
                return newDocs; // We could re-sort here, but keeping it simple
            });
            setView('DOC_DETAIL');
        } else {
            // Fallback if doc not found
            setView('HOME');
        }
    } else {
        // CREATE NEW MODE
        const newDocId = generateId();
        let newDoc: DocumentGroup = {
            id: newDocId,
            title: `Scan ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString().slice(0,5)}`,
            createdAt: timestamp,
            updatedAt: timestamp,
            pages: pages,
            folder: activeFolder || 'Personal' 
        };

        // Save Immediately
        await saveDocumentToDB(newDoc);
        setDocuments(prev => [newDoc, ...prev]);
        setView('HOME');

        // Smart Naming (Background) - Only for new docs or if first page
        setIsSmartNaming(true);
        analyzeDocument(pages[0].displayDataUrl, 'OCR').then((text: string) => {
            if (text) {
                const smartTitle = suggestTitleFromText(text);
                if (smartTitle) {
                    newDoc = { ...newDoc, title: smartTitle };
                    newDoc.pages[0].ocrText = text;
                    saveDocumentToDB(newDoc).then(() => {
                        setDocuments(prev => prev.map(d => d.id === newDocId ? newDoc : d));
                        setIsSmartNaming(false);
                    });
                } else {
                    setIsSmartNaming(false);
                }
            } else {
                setIsSmartNaming(false);
            }
        });
    }
    
    setAppendMode(false);
    setShowAddMenu(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
          const fileArray = Array.from(files);
          const promises = fileArray.map(file => {
              return new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = (e) => resolve(e.target?.result as string);
                  // Fix: Cast file to Blob as it is inferred as unknown
                  reader.readAsDataURL(file as Blob);
              });
          });

          Promise.all(promises).then(dataUrls => {
              handleCaptureResult(dataUrls);
          });
      }
      // Reset input value so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- DOCUMENT EDIT LOGIC ---

  const handleSavePage = async (updatedPage: ScannedPage) => {
      if (!selectedDocId) return;
      const docIndex = documents.findIndex(d => d.id === selectedDocId);
      if (docIndex === -1) return;
      const updatedDoc = { ...documents[docIndex] };
      updatedDoc.pages = updatedDoc.pages.map(p => p.id === updatedPage.id ? updatedPage : p);
      updatedDoc.updatedAt = Date.now();
      await saveDocumentToDB(updatedDoc);
      setDocuments(prev => {
          const newDocs = [...prev];
          newDocs[docIndex] = updatedDoc;
          return newDocs.sort((a,b) => b.updatedAt - a.updatedAt);
      });
      setSelectedPageId(null);
      setView('DOC_DETAIL');
      triggerHaptic();
  };

  const handleDeletePageRequest = (pageId: string) => {
      triggerHaptic();
      setDeleteConfirmState({ isOpen: true, type: 'PAGE', id: pageId });
  };

  const executeDelete = async () => {
      triggerHaptic();
      if (!deleteConfirmState) return;

      if (deleteConfirmState.type === 'BULK') {
          // Delete multiple
          const idsToDelete = Array.from(selectedItems);
          for (const id of idsToDelete) {
              // Fix: Cast id to string as it is inferred as unknown
              await deleteDocumentFromDB(id as string);
          }
          setDocuments(prev => prev.filter(d => !selectedItems.has(d.id)));
          setIsSelectionMode(false);
          setSelectedItems(new Set());
      }
      else if (deleteConfirmState.type === 'DOC' && deleteConfirmState.id) {
          await deleteDocumentFromDB(deleteConfirmState.id);
          setDocuments(prev => prev.filter(d => d.id !== deleteConfirmState.id));
          if (view === 'DOC_DETAIL') setView('HOME');
      } 
      else if (deleteConfirmState.type === 'PAGE' && deleteConfirmState.id) {
          if (!selectedDocId) return;
          const docIndex = documents.findIndex(d => d.id === selectedDocId);
          if (docIndex === -1) return;
          const updatedDoc = { ...documents[docIndex] };
          updatedDoc.pages = updatedDoc.pages.filter(p => p.id !== deleteConfirmState.id);
          
          if (updatedDoc.pages.length === 0) {
              await deleteDocumentFromDB(selectedDocId);
              setDocuments(prev => prev.filter(d => d.id !== selectedDocId));
              setSelectedDocId(null);
              setView('HOME');
          } else {
              updatedDoc.updatedAt = Date.now();
              await saveDocumentToDB(updatedDoc);
              setDocuments(prev => {
                  const newDocs = [...prev];
                  newDocs[docIndex] = updatedDoc;
                  return newDocs;
              });
              setSelectedPageId(null);
              setView('DOC_DETAIL');
          }
      }
      setDeleteConfirmState(null);
  };

  const handleReorderPage = async (docId: string, pageIndex: number, direction: 'UP' | 'DOWN') => {
      triggerHaptic();
      const docIndex = documents.findIndex(d => d.id === docId);
      if (docIndex === -1) return;
      const doc = documents[docIndex];
      const newPages = [...doc.pages];
      
      const targetIndex = direction === 'UP' ? pageIndex - 1 : pageIndex + 1;
      if (targetIndex < 0 || targetIndex >= newPages.length) return;

      [newPages[pageIndex], newPages[targetIndex]] = [newPages[targetIndex], newPages[pageIndex]];
      
      const updatedDoc = { ...doc, pages: newPages, updatedAt: Date.now() };
      await saveDocumentToDB(updatedDoc);
      setDocuments(prev => {
          const newDocs = [...prev];
          newDocs[docIndex] = updatedDoc;
          return newDocs;
      });
  };

  const handlePageDrop = async (targetIndex: number) => {
      if (draggedPageIndex === null || draggedPageIndex === targetIndex || !selectedDocId) return;
      
      triggerHaptic();
      const docIndex = documents.findIndex(d => d.id === selectedDocId);
      if (docIndex === -1) return;
      
      const doc = documents[docIndex];
      const newPages = [...doc.pages];
      
      // Remove moved item
      const [movedPage] = newPages.splice(draggedPageIndex, 1);
      // Insert at new position
      newPages.splice(targetIndex, 0, movedPage);

      const updatedDoc = { ...doc, pages: newPages, updatedAt: Date.now() };
      
      // Optimistic update
      setDocuments(prev => {
          const newDocs = [...prev];
          newDocs[docIndex] = updatedDoc;
          return newDocs;
      });
      
      setDraggedPageIndex(null);
      await saveDocumentToDB(updatedDoc);
  };

  const startTitleEdit = (currentTitle: string) => {
      setTempTitle(currentTitle);
      setIsEditingTitle(true);
  };

  const saveTitleEdit = async () => {
      if (activeDoc && tempTitle.trim()) {
          const updated = { ...activeDoc, title: tempTitle.trim(), updatedAt: Date.now() };
          await saveDocumentToDB(updated);
          setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
      }
      setIsEditingTitle(false);
  };
  
  const handleShareDoc = async (doc: DocumentGroup) => {
      triggerHaptic();
      if (doc.pages.length === 0) return;
      
      try {
          // Native sharing of PDF
          const blob = getPDFBlob(doc.pages);
          const file = new File([blob], `${doc.title.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });
          
          if (navigator.share && navigator.canShare({ files: [file] })) {
              await navigator.share({
                  files: [file],
                  title: doc.title,
                  text: 'Scanned document from DocuScan Offline',
              });
          } else {
              // Fallback to download
              generatePDF(doc.pages, doc.title);
          }
      } catch (err) {
          console.error("Share failed", err);
          // Fallback
          generatePDF(doc.pages, doc.title);
      }
  };

  const getFilteredDocs = () => {
      let docs = documents;
      if (activeFolder) {
          docs = docs.filter(d => d.folder === activeFolder);
      }
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          docs = docs.filter(d => {
              // Search Title
              if (d.title.toLowerCase().includes(q)) return true;
              // Search OCR Content
              return d.pages.some(p => (p.ocrText || '').toLowerCase().includes(q));
          });
      }
      return docs;
  };

  const toggleViewMode = () => {
      triggerHaptic();
      const newMode = viewMode === 'LIST' ? 'GRID' : 'LIST';
      setViewMode(newMode);
      localStorage.setItem('view_mode', newMode);
  };

  const filteredDocs = getFilteredDocs();
  const activeDoc = documents.find(d => d.id === selectedDocId);
  const activePage = activeDoc?.pages.find(p => p.id === selectedPageId);
  const allFolderNames = [...baseFolders.map(f => f.id), ...customFolders];

  // --- LOCK SCREEN ---
  if (isLocked) {
      return (
          <div className="h-full w-full bg-zinc-950 text-white flex flex-col items-center justify-center p-8 font-sans">
              <div className="mb-10 text-center">
                  <div className={`w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-4 border transition-colors ${lockError ? 'border-red-500 text-red-500' : 'border-zinc-800 text-brand-400'}`}>
                      {lockError ? <AlertCircle className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
                  </div>
                  <h2 className="text-xl font-medium tracking-wide">Enter Passcode</h2>
                  {lockError && <p className="text-red-500 text-sm mt-2 animate-pulse">Incorrect Passcode</p>}
              </div>
              <div className="flex gap-4 mb-12">
                  {[0, 1, 2, 3].map(i => (
                      <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${i < passcode.length ? (lockError ? 'bg-red-500 border-red-500' : 'bg-brand-500 border-brand-500') : 'border-zinc-700'}`}></div>
                  ))}
              </div>
              <div className="grid grid-cols-3 gap-6 w-full max-w-xs">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                      <button key={num} onClick={() => handlePasscodeEnter(num.toString())} className="w-20 h-20 rounded-full bg-zinc-900 text-2xl font-light hover:bg-zinc-800 active:bg-brand-500 active:text-black transition-colors flex items-center justify-center">{num}</button>
                  ))}
                  <button onClick={handleResetPasscode} className="w-20 h-20 rounded-full flex items-center justify-center text-xs text-zinc-500 hover:text-red-400 font-medium">Reset</button>
                  <button onClick={() => handlePasscodeEnter('0')} className="w-20 h-20 rounded-full bg-zinc-900 text-2xl font-light hover:bg-zinc-800 active:bg-brand-500 active:text-black transition-colors flex items-center justify-center">0</button>
                  <button onClick={() => setPasscode(prev => prev.slice(0, -1))} className="w-20 h-20 rounded-full flex items-center justify-center text-zinc-400 hover:text-white"><ArrowLeft className="w-6 h-6" /></button>
              </div>
          </div>
      );
  }

  // --- SETTINGS MODAL ---
  if (showSettings) {
      return (
          <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col p-6 font-sans text-white">
              <div className="flex items-center gap-4 mb-8">
                  <button onClick={() => { setShowSettings(false); setChangePassMode(false); setPassMismatchError(''); }} className="p-2 -ml-2 rounded-full hover:bg-zinc-900">
                      <ArrowLeft className="w-6 h-6" />
                  </button>
                  <h2 className="text-xl font-bold">Settings</h2>
              </div>
              <div className="space-y-6">
                  {/* STORAGE STATS */}
                  <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                      <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><HardDrive className="w-5 h-5" /></div>
                          <h3 className="font-medium">Storage</h3>
                      </div>
                      <div className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                          <span className="text-sm text-zinc-400">Total Used Space</span>
                          <span className="font-mono text-sm font-semibold text-zinc-200">{storageUsage}</span>
                      </div>
                  </div>

                  <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                      <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-brand-500/10 rounded-lg text-brand-400"><Lock className="w-5 h-5" /></div>
                          <h3 className="font-medium">Security</h3>
                      </div>
                      {!changePassMode ? (
                          <div className="flex flex-col gap-2">
                              <button onClick={() => { setChangePassMode(true); setPassMismatchError(''); }} className="w-full py-3 bg-zinc-800 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors">Change Passcode</button>
                              <button onClick={handleManualLock} className="w-full py-3 bg-zinc-800 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors text-zinc-300">Lock App Now</button>
                          </div>
                      ) : (
                          <div className="space-y-3">
                              <p className="text-xs text-zinc-500 mb-2">Enter new 4-digit passcode.</p>
                              <input type="password" maxLength={4} placeholder="New Passcode" className={`w-full bg-zinc-950 border rounded-xl p-3 text-center tracking-widest outline-none focus:border-brand-500 ${passMismatchError ? 'border-red-500' : 'border-zinc-700'}`} value={newPasscode} onChange={(e) => { setNewPasscode(e.target.value); setPassMismatchError(''); }} />
                              <input type="password" maxLength={4} placeholder="Confirm Passcode" className={`w-full bg-zinc-950 border rounded-xl p-3 text-center tracking-widest outline-none focus:border-brand-500 ${passMismatchError ? 'border-red-500' : 'border-zinc-700'}`} value={confirmPasscode} onChange={(e) => { setConfirmPasscode(e.target.value); setPassMismatchError(''); }} />
                              {passMismatchError && <div className="flex items-center gap-2 text-red-500 text-xs px-1"><AlertCircle className="w-3 h-3" />{passMismatchError}</div>}
                              <div className="flex gap-2 mt-2">
                                  <button onClick={() => { setChangePassMode(false); setPassMismatchError(''); }} className="flex-1 py-3 bg-zinc-800 rounded-xl text-sm">Cancel</button>
                                  <button onClick={handleChangePassword} className="flex-1 py-3 bg-brand-500 text-white rounded-xl text-sm font-medium">Save</button>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  // --- MAIN VIEW ---
  return (
    <div className="h-full w-full max-w-md mx-auto bg-zinc-950 flex flex-col shadow-2xl relative overflow-hidden text-white font-sans">
      
      {/* GLOBAL TOAST (Fixed position) */}
      {isSmartNaming && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur text-white text-xs px-4 py-2 rounded-full z-40 flex items-center gap-2 animate-pulse pointer-events-none">
              <Search className="w-3 h-3" /> Auto-naming document...
          </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmState && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-zinc-900 w-full max-w-xs p-6 rounded-3xl border border-zinc-800 shadow-2xl">
                  <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-500 mx-auto"><Trash2 className="w-6 h-6" /></div>
                  <h3 className="text-lg font-semibold text-center mb-2">Delete {deleteConfirmState.type === 'BULK' ? `${selectedItems.size} Items` : deleteConfirmState.type === 'DOC' ? 'Document' : 'Page'}?</h3>
                  <p className="text-zinc-400 text-center text-sm mb-6">This action cannot be undone.</p>
                  <div className="flex gap-3">
                      <button onClick={() => setDeleteConfirmState(null)} className="flex-1 py-3 bg-zinc-800 rounded-xl font-medium text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
                      <button onClick={executeDelete} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium text-sm hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">Delete</button>
                  </div>
              </div>
          </div>
      )}

      {/* 1. HOME / DASHBOARD */}
      {view === 'HOME' && (
          <>
            <div className="bg-zinc-950 p-6 flex flex-col gap-6 sticky top-0 z-20 shadow-sm border-b border-zinc-900">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
                        <p className="text-zinc-500 text-xs mt-1">{documents.length} Files • {storageUsage}</p>
                    </div>
                    <div className="flex gap-2">
                        {/* Select Button */}
                        <button onClick={toggleSelectionMode} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${isSelectionMode ? 'bg-brand-500 border-brand-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                            {isSelectionMode ? 'Done' : 'Select'}
                        </button>
                        <button onClick={toggleViewMode} className="p-2 bg-zinc-900 rounded-full hover:bg-zinc-800 border border-zinc-800 text-zinc-400">
                             {viewMode === 'LIST' ? <LayoutGrid className="w-5 h-5" /> : <ListIcon className="w-5 h-5" />}
                        </button>
                        <button onClick={() => setShowSettings(true)} className="p-2 bg-zinc-900 rounded-full hover:bg-zinc-800 border border-zinc-800"><Settings className="w-5 h-5 text-zinc-400" /></button>
                    </div>
                </div>
                
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                    <input type="text" placeholder="Search by title or text..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-zinc-900 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder-zinc-600 text-zinc-200" />
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-6 pb-32 no-scrollbar">
                {/* Folders Section */}
                {!activeFolder && !isSelectionMode && !searchQuery && (
                    <div className="mb-8">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Folders</h2>
                            <button onClick={() => setIsCreatingFolder(true)} className="p-1 bg-zinc-900 rounded-full text-zinc-400 hover:text-white"><Plus className="w-4 h-4"/></button>
                        </div>
                        
                        {isCreatingFolder && (
                            <div className="flex gap-2 mb-4">
                                <input autoFocus type="text" placeholder="Folder Name" className="bg-zinc-900 rounded-lg px-3 py-2 text-sm flex-1 outline-none border border-brand-500" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} />
                                <button onClick={handleCreateFolder} className="bg-brand-500 px-3 rounded-lg text-white text-xs">Add</button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            {allFolderNames.map((folderId, idx) => {
                                const isBase = baseFolders.find(f => f.id === folderId);
                                const color = isBase ? isBase.color : 'bg-zinc-700';
                                const count = documents.filter(d => d.folder === folderId).length;
                                return (
                                    <button key={folderId} onClick={() => setActiveFolder(folderId)} className="bg-zinc-900 p-4 rounded-2xl flex flex-col items-start gap-3 hover:bg-zinc-800 transition-colors border border-zinc-800">
                                        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white shadow-lg`}><Folder className="w-5 h-5" /></div>
                                        <div><span className="block font-medium text-sm truncate w-full">{folderId}</span><span className="text-xs text-zinc-500">{count} Items</span></div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Header for List */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                        {activeFolder ? <button onClick={() => setActiveFolder(null)} className="flex items-center gap-1 hover:text-white"><ArrowLeft className="w-3 h-3" /> {activeFolder}</button> : (isSelectionMode ? `Selected (${selectedItems.size})` : 'Recent Scans')}
                    </h2>
                </div>

                {/* Documents List */}
                {isLoading ? (
                    <div className="flex justify-center mt-10"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>
                ) : filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-600 gap-4"><Folder className="w-12 h-12 opacity-20" /><p className="text-sm">No documents found</p></div>
                ) : (
                    <div className={`${viewMode === 'GRID' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}`}>
                        {filteredDocs.map(doc => {
                            const isSelected = selectedItems.has(doc.id);
                            return (
                                <div 
                                    key={doc.id} 
                                    onClick={() => {
                                        if (isSelectionMode) {
                                            toggleItemSelection(doc.id);
                                        } else {
                                            setSelectedDocId(doc.id);
                                            setView('DOC_DETAIL');
                                        }
                                    }}
                                    className={`bg-zinc-900 p-3 rounded-2xl flex ${viewMode === 'GRID' ? 'flex-col items-start gap-3' : 'items-center gap-4'} border transition-colors cursor-pointer group relative overflow-hidden ${isSelected ? 'border-brand-500 bg-brand-500/5' : 'border-zinc-800 hover:bg-zinc-800/80'}`}
                                >
                                    
                                    {isSelectionMode && (
                                        <div className={`absolute top-3 right-3 z-10 w-6 h-6 rounded-full border flex items-center justify-center bg-black/50 backdrop-blur ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-white/30'}`}>
                                            {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                                        </div>
                                    )}

                                    <div className={`${viewMode === 'GRID' ? 'w-full aspect-[3/4]' : 'w-12 h-16'} bg-zinc-800 rounded-lg overflow-hidden shrink-0 relative`}>
                                        {doc.pages.length > 0 ? <img src={doc.pages[0].displayDataUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-700" />}
                                        {viewMode === 'GRID' && !isSelectionMode && (
                                             <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur text-white text-[10px] px-1.5 py-0.5 rounded">{doc.pages.length}</div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 w-full">
                                        <h3 className={`font-medium text-sm truncate ${isSelected ? 'text-brand-400' : 'text-zinc-100'}`}>{doc.title}</h3>
                                        <p className="text-xs text-zinc-500 mt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    {!isSelectionMode && viewMode === 'LIST' && (
                                        <div className="flex items-center gap-1"><span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md">{doc.pages.length}p</span></div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </main>

            {/* SELECTION ACTION BAR */}
            <div className={`absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 p-4 transition-transform duration-300 z-40 ${isSelectionMode ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="flex gap-3 justify-center">
                    <button onClick={handleBulkDeleteRequest} disabled={selectedItems.size === 0} className="flex-1 bg-zinc-800 text-red-400 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-zinc-800/80">
                        <Trash2 className="w-4 h-4" /> Delete ({selectedItems.size})
                    </button>
                    <button onClick={handleBulkPDF} disabled={selectedItems.size === 0} className="flex-1 bg-brand-500 text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-brand-500/20 active:scale-95">
                        <FileText className="w-4 h-4" /> PDF ({selectedItems.size})
                    </button>
                </div>
            </div>

            {/* Expandable FAB */}
            <div className={`absolute bottom-8 right-6 flex flex-col items-end gap-4 z-30 ${isSelectionMode ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'} transition-opacity`}>
                 <div className={`flex flex-col gap-3 transition-all duration-300 ${showAddMenu ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
                     <button onClick={() => { setAppendMode(false); fileInputRef.current?.click(); }} className="flex items-center gap-3 pr-2 group">
                         <span className="bg-black/80 backdrop-blur text-white text-xs px-2 py-1 rounded-md shadow-lg">Upload</span>
                         <div className="w-12 h-12 bg-zinc-800 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-zinc-700 transition-colors border border-zinc-700"><Upload className="w-5 h-5" /></div>
                     </button>
                     <button onClick={() => { setAppendMode(false); setView('CAMERA'); setShowAddMenu(false); }} className="flex items-center gap-3 pr-2 group">
                         <span className="bg-black/80 backdrop-blur text-white text-xs px-2 py-1 rounded-md shadow-lg">Scan</span>
                         <div className="w-12 h-12 bg-zinc-800 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-zinc-700 transition-colors border border-zinc-700"><Camera className="w-5 h-5" /></div>
                     </button>
                 </div>
                 <button onClick={() => { triggerHaptic(); setShowAddMenu(!showAddMenu); }} className={`pointer-events-auto w-16 h-16 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-all duration-300 hover:bg-brand-400 z-50 ${showAddMenu ? 'bg-zinc-800 rotate-45 border border-zinc-700' : 'bg-brand-500 shadow-brand-500/40'}`}><Plus className="w-8 h-8" /></button>
            </div>
            
          </>
      )}

      {/* 2. DOCUMENT DETAIL VIEW */}
      {view === 'DOC_DETAIL' && activeDoc && (
          <div className="flex flex-col h-full bg-zinc-950">
              <div className="p-4 flex items-center gap-4 border-b border-zinc-900 bg-zinc-950 z-20">
                  <button onClick={() => setView('HOME')} className="p-2 -ml-2 hover:bg-zinc-900 rounded-full text-zinc-400 hover:text-white"><ArrowLeft className="w-6 h-6" /></button>
                  <div className="flex-1 min-w-0 mr-2">
                      {isEditingTitle ? (
                          <div className="flex items-center gap-2">
                              <input 
                                  autoFocus
                                  type="text" 
                                  className="bg-zinc-900 border border-brand-500 rounded-lg px-3 py-1.5 text-white text-sm w-full outline-none focus:ring-1 focus:ring-brand-500" 
                                  value={tempTitle} 
                                  onChange={(e) => setTempTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveTitleEdit();
                                      if (e.key === 'Escape') setIsEditingTitle(false);
                                  }}
                              />
                              <button onClick={saveTitleEdit} className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 active:scale-95 transition-transform"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setIsEditingTitle(false)} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 active:scale-95 transition-transform"><X className="w-4 h-4" /></button>
                          </div>
                      ) : (
                          <div onClick={() => startTitleEdit(activeDoc.title)} className="group cursor-pointer">
                              <div className="flex items-center gap-2">
                                  <h2 className="font-semibold text-lg text-white truncate">{activeDoc.title}</h2>
                                  <Pencil className="w-3.5 h-3.5 text-zinc-600 group-hover:text-brand-400 transition-colors" />
                              </div>
                              <p className="text-xs text-zinc-500 mt-0.5">{new Date(activeDoc.createdAt).toLocaleString()}</p>
                          </div>
                      )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleShareDoc(activeDoc)} className="p-2 bg-zinc-900 rounded-full text-brand-400 hover:bg-zinc-800"><Share2 className="w-5 h-5" /></button>
                    <button onClick={() => { triggerHaptic(); setDeleteConfirmState({ isOpen: true, type: 'DOC', id: activeDoc.id }); }} className="p-2 bg-zinc-900 rounded-full text-red-400 hover:bg-red-500/10"><Trash2 className="w-5 h-5" /></button>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 pb-20">
                  <div className="grid grid-cols-2 gap-4">
                      {activeDoc.pages.map((page, idx) => (
                          <div 
                              key={page.id} 
                              draggable
                              onDragStart={(e) => { triggerHaptic(); setDraggedPageIndex(idx); e.dataTransfer.effectAllowed = 'move'; }}
                              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                              onDrop={(e) => handlePageDrop(idx)}
                              className={`relative aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden border transition-all group
                                ${draggedPageIndex === idx ? 'opacity-50 border-brand-500 border-dashed scale-95' : 'border-zinc-800'}
                                ${draggedPageIndex !== null && draggedPageIndex !== idx ? 'hover:border-brand-500/50' : ''}
                              `}
                          >
                              <img src={page.displayDataUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => { setSelectedPageId(page.id); setView('EDIT'); }} />
                              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none">{idx + 1}</div>
                              {/* Reorder Controls (Fallback for touch) */}
                              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {idx > 0 && <button onClick={(e) => { e.stopPropagation(); handleReorderPage(activeDoc.id, idx, 'UP'); }} className="p-1 bg-black/50 rounded hover:bg-brand-500 text-white"><ArrowUp className="w-3 h-3" /></button>}
                                  {idx < activeDoc.pages.length - 1 && <button onClick={(e) => { e.stopPropagation(); handleReorderPage(activeDoc.id, idx, 'DOWN'); }} className="p-1 bg-black/50 rounded hover:bg-brand-500 text-white"><ArrowDown className="w-3 h-3" /></button>}
                              </div>
                          </div>
                      ))}
                      
                      {/* NEW SPLIT ACTION ADD CARD */}
                      <div className="flex flex-col gap-2 aspect-[3/4]">
                          <div className="flex-1 bg-zinc-900/50 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-3 hover:bg-zinc-800/50 transition-colors group">
                               <div className="flex flex-col items-center gap-4 w-full">
                                   <button onClick={() => { triggerHaptic(); setAppendMode(true); setView('CAMERA'); }} className="flex-1 w-full flex flex-col items-center gap-1 text-zinc-500 hover:text-brand-400 transition-colors">
                                      <div className="p-3 bg-zinc-800 rounded-full group-hover:bg-zinc-700 group-hover:shadow-lg transition-all border border-zinc-700/50">
                                          <Camera className="w-5 h-5" />
                                      </div>
                                      <span className="text-[10px] font-medium">Scan</span>
                                   </button>
                                   <div className="w-12 h-px bg-zinc-800"></div>
                                   <button onClick={() => { triggerHaptic(); setAppendMode(true); fileInputRef.current?.click(); }} className="flex-1 w-full flex flex-col items-center gap-1 text-zinc-500 hover:text-brand-400 transition-colors">
                                      <div className="p-3 bg-zinc-800 rounded-full group-hover:bg-zinc-700 group-hover:shadow-lg transition-all border border-zinc-700/50">
                                          <Upload className="w-5 h-5" />
                                      </div>
                                      <span className="text-[10px] font-medium">Import</span>
                                   </button>
                               </div>
                          </div>
                      </div>

                  </div>
              </div>
          </div>
      )}

      {view === 'CAMERA' && <CameraView onFinish={handleCaptureResult} onClose={() => { setView(appendMode ? 'DOC_DETAIL' : 'HOME'); setAppendMode(false); }} />}

      {view === 'EDIT' && activePage && <EditView page={activePage} onSave={handleSavePage} onDelete={handleDeletePageRequest} onCancel={() => setView('DOC_DETAIL')} />}

      {/* Moved Input here so it is always present */}
      <input type="file" ref={fileInputRef} accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
    </div>
  );
}