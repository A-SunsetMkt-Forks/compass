const React = require('react');
const chai = require('chai');
const expect = chai.expect;
const chaiEnzyme = require('chai-enzyme');
const { mount } = require('enzyme');
const sinon = require('sinon');
const DocumentListView = require('../../src/components/document-list-view');

chai.use(chaiEnzyme());

describe('<DocumentListView />', () => {
  describe('#render', () => {
    context('when the documents have objects for ids', () => {
      const docs = [{ _id: { name: 'test-1' }}, { _id: { name: 'test-2' }}];
      const scrollHandler = sinon.spy();
      const component = mount(
        <DocumentListView docs={docs} scrollHandler={scrollHandler} isEditable={false} />
      );

      it('renders all the documents', () => {
        const wrapper = component.find('.document');
        expect(wrapper).to.have.length(2);
      });
    });
  });
});
